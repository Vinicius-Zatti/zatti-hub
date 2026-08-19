"use server";

import { revalidatePath } from "next/cache";
import { getAcessoAtual, requireGestaoFichasTecnicas, registrarAuditoria, registrarAuditoriaBatch } from "@/lib/acesso";
import {
  carregarFichaTecnicaParaExibir,
  criarCategoriaFicha,
  excluirFichaTecnica,
  getFichaTecnicaCompleta,
  salvarConfiguracaoFinanceira,
  salvarConversaoProduto,
  salvarConversoesProduto,
  salvarFichaTecnica,
  type EntradaFichaTecnica,
  type FichaTecnicaParaExibir,
} from "@/lib/banco/fichas-tecnicas";
import {
  categoriaFichaEntradaSchema,
  configuracaoFinanceiraEntradaSchema,
  conversaoProdutoEntradaSchema,
  fichaTecnicaEntradaSchema,
  idUuidSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
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
    const entrada = validarEntrada(fichaTecnicaEntradaSchema, input);

    const antes = idValidado ? await getFichaTecnicaCompleta(acesso.unidadeId, idValidado) : null;
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
    revalidatePath("/fichas-tecnicas/nova");
    return { ok: true, categoria };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a categoria.") };
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
