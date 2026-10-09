"use server";

import { revalidatePath } from "next/cache";
import { getAcessoAtual, requireGestaoFichasTecnicas, registrarAuditoria, registrarAuditoriaBatch } from "@/lib/acesso";
import {
  atualizarPrecoVendaFicha,
  atualizarPrecosCanaisFicha,
  atualizarPrecosTodosCanaisFichas,
  atualizarPrecosVendaFichas,
  carregarDadosNovaFichaTecnica,
  carregarFichaTecnicaParaExibir,
  criarCategoriaFicha,
  definirFotoFichaTecnica,
  editarCategoriaFicha,
  excluirCategoriaFicha,
  excluirFichaTecnica,
  getFichaTecnicaCompleta,
  removerFotoFichaTecnica,
  salvarConfiguracaoFinanceira,
  salvarConversaoProduto,
  salvarConversoesProduto,
  salvarFichaTecnica,
  urlFotoFichaTecnica,
  type DadosNovaFichaTecnica,
  type EntradaFichaTecnica,
  type FichaTecnicaParaExibir,
} from "@/lib/banco/fichas-tecnicas";
import {
  categoriaFichaEntradaSchema,
  configuracaoFinanceiraEntradaSchema,
  conversaoProdutoEntradaSchema,
  editarCategoriaFichaEntradaSchema,
  fichaTecnicaEntradaSchema,
  idUuidSchema,
  precoVendaFichaEntradaSchema,
  precosCanalFichaEntradaSchema,
  precosTodosCanaisFichaEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { TAMANHO_MAXIMO_FOTO_FICHA } from "@/lib/foto-ficha";
import type { CategoriaFicha, ConfiguracaoFinanceira } from "@/lib/types";

export type ResultadoSalvarFicha = { ok: true; id: string; sku: string } | { ok: false; mensagem: string };
export type ResultadoCategoria = { ok: true; categoria: CategoriaFicha } | { ok: false; mensagem: string };
export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

function revalidarListagem() {
  revalidatePath("/fichas-tecnicas");
}

/** Cria (fichaId null) ou edita ficha existente - sempre Gestão/master,
 * unidadeId sempre resolvido no servidor via `requireGestaoFichasTecnicas`,
 * nunca aceito do cliente. Delega pra `salvar_ficha_tecnica` no Postgres,
 * que grava ficha + componentes + etapas + versão numa única transação. */
export async function salvarFichaTecnicaAction(
  fichaId: string | null,
  input: EntradaFichaTecnica,
): Promise<ResultadoSalvarFicha> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_salvar");
    const idValidado = fichaId === null ? null : validarEntrada(idUuidSchema, fichaId);
    const entradaValidada = validarEntrada(fichaTecnicaEntradaSchema, input);

    const antes = idValidado ? await getFichaTecnicaCompleta(acesso.unidadeId, idValidado) : null;
    // A foto muda pelas ações próprias dela (enviar/remover). Aqui vale o que
    // está no banco, nunca o que o formulário trouxe - senão um formulário
    // aberto antes do envio da foto apagaria a foto ao salvar. Resta uma
    // janela de milissegundos (salvar e trocar a foto ao mesmo tempo) em que
    // o caminho antigo volta: fechar exige mudar a RPC salvar_ficha_tecnica.
    // Risco aceito em 09/10/2026 (perder a foto é aceitável, anexa de novo).
    const entrada = { ...entradaValidada, fotoPath: antes?.fotoPath ?? null };
    const salva = await salvarFichaTecnica({ unidadeId: acesso.unidadeId, fichaId: idValidado, entrada });

    await registrarAuditoria({
      acesso,
      acao: idValidado ? "editar" : "criar",
      entidade: "ficha_tecnica",
      entidadeId: salva.id,
      dadosAntigos: antes,
      dadosNovos: salva,
    });

    revalidarListagem();
    revalidatePath(`/fichas-tecnicas/${salva.id}`);
    return { ok: true, id: salva.id, sku: salva.sku };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a ficha técnica.") };
  }
}

/** Categoria nova também é Gestão/master - a listagem (`listarCategoriasFicha`)
 * é aberta a todos os papéis, chamada direto pela página. */
export async function criarCategoriaFichaAction(input: {
  camada: "PRE" | "VEN";
  codigo: string;
  nome: string;
}): Promise<ResultadoCategoria> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("categoria_ficha_criar");
    const entrada = validarEntrada(categoriaFichaEntradaSchema, input);
    const categoria = await criarCategoriaFicha({ unidadeId: acesso.unidadeId, ...entrada });

    await registrarAuditoria({
      acesso,
      acao: "criar",
      entidade: "categoria_ficha",
      entidadeId: categoria.id,
      dadosNovos: categoria,
    });

    revalidatePath("/fichas-tecnicas/categorias");
    revalidatePath("/fichas-tecnicas");
    return { ok: true, categoria };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a categoria.") };
  }
}

export type ResultadoEditarCategoria = { ok: true; fichasAtualizadas: number } | { ok: false; mensagem: string };

/** Trocar o código atualiza o SKU (chars 4-6) de toda ficha cadastrada
 * nessa categoria - a UI avisa antes de chamar isso quando há fichas
 * afetadas (ver `renomear_categoria_ficha` no Postgres). */
export async function editarCategoriaFichaAction(input: {
  id: string;
  codigo: string;
  nome: string;
}): Promise<ResultadoEditarCategoria> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("categoria_ficha_editar");
    const entrada = validarEntrada(editarCategoriaFichaEntradaSchema, input);
    const resultado = await editarCategoriaFicha(acesso.unidadeId, entrada.id, entrada.codigo, entrada.nome);

    await registrarAuditoria({
      acesso,
      acao: "editar",
      entidade: "categoria_ficha",
      entidadeId: entrada.id,
      dadosNovos: { codigo: resultado.codigo, nome: entrada.nome, fichasAtualizadas: resultado.fichasAtualizadas },
    });

    revalidatePath("/fichas-tecnicas/categorias");
    revalidatePath("/fichas-tecnicas");
    return { ok: true, fichasAtualizadas: resultado.fichasAtualizadas };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar a categoria.") };
  }
}

/** Bloqueado pelo banco se a categoria tiver ficha técnica cadastrada - a
 * mensagem já vem traduzida de `excluirCategoriaFicha`. */
export async function excluirCategoriaFichaAction(id: string): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("categoria_ficha_excluir");
    const idValidado = validarEntrada(idUuidSchema, id);
    await excluirCategoriaFicha(acesso.unidadeId, idValidado);

    await registrarAuditoria({
      acesso,
      acao: "excluir",
      entidade: "categoria_ficha",
      entidadeId: idValidado,
    });

    revalidatePath("/fichas-tecnicas/categorias");
    revalidatePath("/fichas-tecnicas");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir a categoria.") };
  }
}

/** Bloqueado pelo banco (on delete restrict) se a ficha estiver em uso como
 * componente de outra - a mensagem já vem traduzida de `excluirFichaTecnica`. */
export async function excluirFichaTecnicaAction(id: string): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_excluir");
    const idValidado = validarEntrada(idUuidSchema, id);
    const antes = await getFichaTecnicaCompleta(acesso.unidadeId, idValidado);
    await excluirFichaTecnica(acesso.unidadeId, idValidado);

    await registrarAuditoria({
      acesso,
      acao: "excluir",
      entidade: "ficha_tecnica",
      entidadeId: idValidado,
      dadosAntigos: antes,
    });

    revalidarListagem();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir a ficha técnica.") };
  }
}

export type ResultadoFotoFicha = { ok: true; fotoUrl: string | null } | { ok: false; mensagem: string };

/** Foto da ficha - chega já reduzida pelo navegador (ver
 * `FotoFichaTecnica`); o limite de 300 KB e o tipo real do arquivo são
 * conferidos de novo em `definirFotoFichaTecnica`. Usa o mesmo limite de
 * tentativas de salvar a ficha. */
export async function enviarFotoFichaAction(formData: FormData): Promise<ResultadoFotoFicha> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_salvar");
    const idValidado = validarEntrada(idUuidSchema, formData.get("id"));
    const arquivo = formData.get("foto");
    if (!(arquivo instanceof File)) throw new ErroPublico("Nenhuma foto recebida.");
    if (arquivo.size > TAMANHO_MAXIMO_FOTO_FICHA) {
      throw new ErroPublico("A foto passou de 300 KB. Recarregue a página e tente de novo.");
    }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const { fotoPath, anterior } = await definirFotoFichaTecnica({
      unidadeId: acesso.unidadeId,
      fichaId: idValidado,
      bytes,
    });

    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "ficha_tecnica_foto",
      entidadeId: idValidado,
      dadosAntigos: { fotoPath: anterior },
      dadosNovos: { fotoPath, tamanho: bytes.length },
    });

    revalidatePath(`/fichas-tecnicas/${idValidado}`);
    return { ok: true, fotoUrl: await urlFotoFichaTecnica(acesso.unidadeId, idValidado, fotoPath) };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a foto.") };
  }
}

export async function removerFotoFichaAction(id: string): Promise<ResultadoFotoFicha> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_salvar");
    const idValidado = validarEntrada(idUuidSchema, id);
    const anterior = await removerFotoFichaTecnica(acesso.unidadeId, idValidado);

    await registrarAuditoria({
      acesso,
      acao: "excluir",
      entidade: "ficha_tecnica_foto",
      entidadeId: idValidado,
      dadosAntigos: { fotoPath: anterior },
    });

    revalidatePath(`/fichas-tecnicas/${idValidado}`);
    return { ok: true, fotoUrl: null };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível remover a foto.") };
  }
}

/** Conversão de unidade por produto (Estoque -> uso na ficha) - só
 * Gestão/master, uma conversão por produto (upsert). */
export async function salvarConversaoProdutoAction(input: {
  produtoSku: string;
  unidadeSaida: string;
  fatorPorUnidadeBase: number;
  fatorCorrecao: number;
  descricao: string;
}): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("conversao_produto_salvar");
    const entrada = validarEntrada(conversaoProdutoEntradaSchema, input);
    await salvarConversaoProduto({ unidadeId: acesso.unidadeId, ...entrada });

    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "produto_conversao",
      entidadeId: entrada.produtoSku,
      dadosNovos: entrada,
    });

    revalidatePath("/fichas-tecnicas/conversoes");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a conversão.") };
  }
}

/** "Salvar todos" da grade de Conversões. */
export async function salvarConversoesProdutoAction(
  entradas: { produtoSku: string; unidadeSaida: string; fatorPorUnidadeBase: number; fatorCorrecao: number; descricao: string }[],
): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("conversao_produto_salvar");
    const entradasValidadas = entradas.map((entrada) => validarEntrada(conversaoProdutoEntradaSchema, entrada));
    await salvarConversoesProduto({ unidadeId: acesso.unidadeId, entradas: entradasValidadas });

    await registrarAuditoriaBatch(
      entradasValidadas.map((entrada) => ({
        acesso,
        acao: "salvar",
        entidade: "produto_conversao",
        entidadeId: entrada.produtoSku,
        dadosNovos: entrada,
      })),
    );

    revalidatePath("/fichas-tecnicas/conversoes");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar as conversões.") };
  }
}

export type ResultadoAbrirFicha =
  | { ok: true; dados: FichaTecnicaParaExibir; podeGerir: boolean }
  | { ok: false; mensagem: string };

/** Busca do cliente pra abrir a ficha numa janela sobreposta à listagem
 * (sem navegar pra outra URL) - consulta é liberada a todos os papéis. */
export async function abrirFichaTecnicaAction(id: string): Promise<ResultadoAbrirFicha> {
  const acesso = await getAcessoAtual();
  const podeGerir = acesso.role !== "operacional";

  try {
    const idValidado = validarEntrada(idUuidSchema, id);
    const dados = await carregarFichaTecnicaParaExibir(acesso.unidadeId, idValidado, podeGerir);
    if (!dados) return { ok: false, mensagem: "Ficha técnica não encontrada." };
    return { ok: true, dados, podeGerir };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível carregar a ficha técnica.") };
  }
}

/** Calculadora de Margem de Contribuição - só Gestão/master, tanto ver
 * quanto editar (dado sensível: faturamento e lucro do cliente). */
export async function salvarConfiguracaoFinanceiraAction(input: ConfiguracaoFinanceira): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("configuracao_financeira_salvar");
    const entrada = validarEntrada(configuracaoFinanceiraEntradaSchema, input);
    await salvarConfiguracaoFinanceira(acesso.unidadeId, entrada);

    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "configuracao_financeira",
      entidadeId: acesso.unidadeId,
      dadosNovos: entrada,
    });

    revalidatePath("/fichas-tecnicas/calculadora");
    revalidatePath("/fichas-tecnicas");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a configuração financeira.") };
  }
}

/** Edição direta do preço de venda na listagem (1 linha). */
export async function atualizarPrecoVendaFichaAction(id: string, precoVenda: number | null): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_preco_venda_salvar");
    const entrada = validarEntrada(precoVendaFichaEntradaSchema, { id, precoVenda });
    await atualizarPrecoVendaFicha(acesso.unidadeId, entrada.id, entrada.precoVenda);

    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "ficha_tecnica_preco_venda",
      entidadeId: entrada.id,
      dadosNovos: entrada,
    });

    revalidatePath("/fichas-tecnicas");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o preço de venda.") };
  }
}

/** "Salvar todos" da listagem. */
export async function atualizarPrecosVendaFichasAction(
  entradas: { id: string; precoVenda: number | null }[],
): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_preco_venda_salvar");
    const entradasValidadas = entradas.map((entrada) => validarEntrada(precoVendaFichaEntradaSchema, entrada));
    await atualizarPrecosVendaFichas(acesso.unidadeId, entradasValidadas);

    await registrarAuditoriaBatch(
      entradasValidadas.map((entrada) => ({
        acesso,
        acao: "salvar",
        entidade: "ficha_tecnica_preco_venda",
        entidadeId: entrada.id,
        dadosNovos: entrada,
      })),
    );

    revalidatePath("/fichas-tecnicas");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar os preços de venda.") };
  }
}

/** Edição dos 3 preços praticados de delivery na seção "Preços por Canal" da
 * tela de detalhe (Salão continua com `atualizarPrecoVendaFichaAction`). */
export async function salvarPrecosCanaisFichaAction(input: {
  id: string;
  precoVendaDeliveryProprio: number | null;
  precoVendaIfood: number | null;
  precoVenda99Food: number | null;
}): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_precos_canal_salvar");
    const entrada = validarEntrada(precosCanalFichaEntradaSchema, input);
    await atualizarPrecosCanaisFicha(acesso.unidadeId, entrada.id, entrada);

    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "ficha_tecnica_precos_canal",
      entidadeId: entrada.id,
      dadosNovos: entrada,
    });

    revalidatePath(`/fichas-tecnicas/${entrada.id}`);
    revalidarListagem();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar os preços de delivery.") };
  }
}

/** "Salvar todos" da Tabela de Precificação - grava os 4 preços (Salão +
 * 3 canais de delivery) de cada linha alterada de uma vez. */
export async function atualizarPrecosTodosCanaisFichasAction(
  entradas: {
    id: string;
    precoVenda: number | null;
    precoVendaDeliveryProprio: number | null;
    precoVendaIfood: number | null;
    precoVenda99Food: number | null;
  }[],
): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_preco_venda_salvar");
    const entradasValidadas = entradas.map((entrada) => validarEntrada(precosTodosCanaisFichaEntradaSchema, entrada));
    await atualizarPrecosTodosCanaisFichas(acesso.unidadeId, entradasValidadas);

    await registrarAuditoriaBatch(
      entradasValidadas.map((entrada) => ({
        acesso,
        acao: "salvar",
        entidade: "ficha_tecnica_precos_canal",
        entidadeId: entrada.id,
        dadosNovos: entrada,
      })),
    );

    revalidatePath("/fichas-tecnicas/precificacao");
    revalidarListagem();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar os preços.") };
  }
}

export type ResultadoNovaFicha = { ok: true; dados: DadosNovaFichaTecnica } | { ok: false; mensagem: string };

/** Busca do cliente pra abrir "Criar Nova F.T" na janela sobreposta da
 * listagem, sem navegar pra outra página. */
export async function prepararNovaFichaTecnicaAction(): Promise<ResultadoNovaFicha> {
  const acesso = await requireGestaoFichasTecnicas();
  try {
    const dados = await carregarDadosNovaFichaTecnica(acesso.unidadeId);
    return { ok: true, dados };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível carregar o formulário de nova ficha.") };
  }
}
