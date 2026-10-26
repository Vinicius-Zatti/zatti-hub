"use server";

import {
  definirFornecedor1NoProduto,
  excluirProduto,
  inserirProduto,
  listProdutos,
  salvarProdutosEditados,
} from "@/lib/sheets/produtos";
import { sugerirSku } from "@/lib/skus/sugerir";
import { listInventario } from "@/lib/sheets/inventario";
import { salvarDesignacoesBanco } from "@/lib/banco/setores";
import { setoresDaPendencia } from "@/lib/contagem/pendencia";
import { sincronizarFichasRevenda } from "@/lib/banco/fichas-tecnicas";
import {
  lerVinculosPrePreparo,
  prePreparoVinculadoHabilitado,
  sincronizarCustosPrePreparoMelhorEsforco,
  sincronizarPrePreparos,
} from "@/lib/banco/pre-preparo";
import type { Produto } from "@/lib/types";
import { requireGestao, registrarAuditoria, registrarAuditoriaBatch, temPermissao, type AcessoAtual, exigirEdicao } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import {
  fornecedor1Schema,
  nomeProdutoSchema,
  produtoOriginalSchema,
  produtoSchema,
  produtosSchema,
  skuSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";

function revalidarTudo() {
  revalidatePath("/estoque/produtos");
  revalidatePath("/estoque/produtos/edicao");
  revalidatePath("/estoque/pedidos");
  revalidatePath("/estoque/contagem");
}

/** Melhor esforço, depois que os produtos já foram salvos - unidade ainda na
 * planilha (sem Fichas Técnicas) nunca cai aqui. Erro de sincronização não
 * desfaz nem esconde que os produtos foram salvos - a grade já mostrou
 * "Salvo" pro campo que importa de verdade pro usuário. */
async function sincronizarRevendaMelhorEsforco(acesso: AcessoAtual, produtos: Produto[]) {
  if (!acesso.fichasTecnicasHabilitado) return;
  try {
    await sincronizarFichasRevenda(
      acesso.unidadeId,
      produtos.map((p) => ({ sku: p.sku, nome: p.nome, unidadeUso: p.unidadeBase, revenda: p.revenda })),
    );
  } catch (err) {
    console.error("Falha ao sincronizar ficha técnica de revenda:", err);
  }
}

/** Pré-preparo com ficha técnica (piloto): a chave só chega preenchida em
 * unidade habilitada. Depois recalcula o preço dos pré-preparos, que muda
 * quando o preço de um insumo deles foi salvo agora. Os produtos já estão
 * salvos quando isto roda - a mensagem devolvida (aviso, não erro) diz só o
 * que faltou. */
async function sincronizarPrePreparoDaGrade(acesso: AcessoAtual, produtos: Produto[]): Promise<string | null> {
  if (!acesso.fichasTecnicasHabilitado) return null;
  let erros: string[] = [];
  try {
    const comChave = produtos.filter((p) => p.prePreparo !== undefined);
    if (comChave.length > 0 && (await prePreparoVinculadoHabilitado(acesso.unidadeId))) {
      erros = await sincronizarPrePreparos(
        acesso.unidadeId,
        comChave.map((p) => ({ sku: p.sku, nome: p.nome, prePreparo: p.prePreparo === true })),
      );
    }
  } catch (err) {
    console.error("Falha ao sincronizar pré-preparos:", err);
    erros = ["não foi possível ajustar a ficha técnica agora, salve de novo"];
  }
  await sincronizarCustosPrePreparoMelhorEsforco(acesso.unidadeId);
  return erros.length > 0 ? `Produto salvo, mas o pré-preparo não foi ajustado. ${erros.join("; ")}` : null;
}

/** Marcar ou desmarcar pré-preparo cria, reativa ou inativa ficha técnica (Cardápio). Quem não
 * edita o Cardápio (permissão por módulo, fase 6) recebe uma mensagem única ANTES de salvar
 * qualquer coisa, para não gravar o produto e deixar a ficha pela metade. Sem mudança na chave,
 * o resto do produto salva normalmente. */
const MENSAGEM_PRE_PREPARO_SEM_CARDAPIO =
  "Marcar ou desmarcar pré-preparo mexe na ficha técnica, e seu acesso ao Cardápio não permite editar. Nada foi salvo: desfaça a mudança de pré-preparo ou peça a quem administra a equipe.";

async function prePreparoBloqueadoPeloCardapio(acesso: AcessoAtual, produtos: Produto[]): Promise<boolean> {
  if (temPermissao(acesso, "cardapio", "editar")) return false;
  const comChave = produtos.filter((p) => p.prePreparo !== undefined);
  if (comChave.length === 0 || !(await prePreparoVinculadoHabilitado(acesso.unidadeId))) return false;
  const atuais = await lerVinculosPrePreparo(acesso.unidadeId);
  return comChave.some((p) => (p.prePreparo === true) !== (atuais.get(p.sku)?.prePreparo === true));
}

export async function sugerirSkuAction(
  nome: string
): Promise<{ sku: string; grupo: string; motivo: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("sugerir_sku");
    const nomeValidado = validarEntrada(nomeProdutoSchema, nome);
    return await sugerirSku(nomeValidado, acesso.spreadsheetId);
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel sugerir o SKU.") };
  }
}

export async function criarProdutoAction(
  formData: FormData,
): Promise<{ ok: true; produto: Produto } | { ok: false; mensagem: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "cadastros");
    await exigirLimiteRequisicao("salvar_produtos");

    const produto = validarEntrada(produtoSchema, {
      sku: String(formData.get("sku") ?? "").toUpperCase().trim(),
      posicao: formData.get("posicao") ? Number(formData.get("posicao")) : null,
      grupo: String(formData.get("grupo") ?? ""),
      nome: String(formData.get("nome") ?? ""),
      unidadeBase: String(formData.get("unidadeBase") ?? "UN"),
      precoUnitario: formData.get("precoUnitario") ? Number(formData.get("precoUnitario")) : null,
      estoqueNecessarioSemana: formData.get("estoqueNecessarioSemana")
        ? Number(formData.get("estoqueNecessarioSemana"))
        : null,
      estoqueMinimo: formData.get("estoqueMinimo") ? Number(formData.get("estoqueMinimo")) : null,
      nomeCompra: String(formData.get("nomeCompra") ?? ""),
      unidadeEmbalagemFornecedor: "",
      qtdUnidadeBasePorEmbalagem: null,
      precoFornecedor: null,
      fornecedor1: "",
      fornecedor2: "",
      fornecedor3: "",
      fornecedor4: "",
      observacoes: String(formData.get("observacoes") ?? ""),
      ativo: true,
      revenda: false,
    });

    // Criação nunca sobrescreve SKU existente (o upsert apagaria o cadastro).
    await inserirProduto(produto, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "criar",
      entidade: "produto",
      entidadeId: produto.sku,
      dadosNovos: produto,
    });
    revalidarTudo();
    return { ok: true, produto };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar o produto.") };
  }
}

/** Produto criado de uma pendência entra nos setores que contaram o item -
 * sem isso ficava sem setor e sumia da contagem seguinte e da Criar Cotação.
 * O produto já foi gravado: falha aqui volta como aviso pra pessoa fazer a
 * designação à mão em Setores. Planilha não tem setor. */
async function designarSetoresDaPendencia(acesso: AcessoAtual, produto: Produto): Promise<string | undefined> {
  if (acesso.fonteDadosEstoque !== "banco") return undefined;
  try {
    const inventario = await listInventario(acesso.spreadsheetId);
    const setorIds = setoresDaPendencia(inventario, produto.nome);
    if (setorIds.length === 0) return undefined;
    await salvarDesignacoesBanco(acesso.unidadeId, [{ sku: produto.sku, setorIds }]);
    await registrarAuditoria({
      acesso,
      acao: "designar_setor_via_pendencia",
      entidade: "produto",
      entidadeId: produto.sku,
      dadosNovos: { setorIds },
    });
    return undefined;
  } catch (err) {
    console.error("[produtos] designar setor da pendência:", err);
    return "Produto criado, mas sem setor. Defina o setor em Estoque > Setores para ele entrar na próxima contagem.";
  }
}

/** Transforma uma pendência da contagem (item avulso) em produto. Só cria:
 * SKU já cadastrado é recusado, nunca sobrescrito. */
export async function criarProdutoPendenciaAction(
  produto: Produto
): Promise<{ ok: true; aviso?: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "cadastros");
    await exigirLimiteRequisicao("salvar_produtos");
    const entrada = validarEntrada(produtoSchema, produto);
    await inserirProduto(entrada, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "criar",
      entidade: "produto",
      entidadeId: entrada.sku,
      dadosNovos: entrada,
    });
    const aviso = await designarSetoresDaPendencia(acesso, entrada);
    revalidarTudo();
    await sincronizarRevendaMelhorEsforco(acesso, [entrada]);
    return aviso ? { ok: true, aviso } : { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar o produto.") };
  }
}

const MENSAGEM_ORIGINAL_INVALIDO =
  "Não foi possível salvar: os dados desta linha na tela estão desatualizados. Recarregue a página e salve de novo.";

/** O produto como a grade o carregou, só para comparar (nunca é gravado).
 * Validado com o schema tolerante (aceita o dado incompleto que existe no
 * banco). Original enviado que não passa nem nele, ou com SKU diferente do
 * editado, é erro: nunca libera a gravação da linha inteira (parecer do Codex
 * de 26/10/2026). Ausente segue ausente e `salvarProdutosEditados` recusa no
 * banco. */
function originalParaComparar(original: unknown, sku: string): Produto | undefined {
  if (original === undefined || original === null) return undefined;
  const r = produtoOriginalSchema.safeParse(original);
  if (!r.success || r.data.sku !== sku) throw new ErroPublico(MENSAGEM_ORIGINAL_INVALIDO);
  return r.data;
}

/** Cria ou atualiza um produto (por SKU) direto da grade de Edição de Dados.
 * Com `original` (o produto como a grade o carregou), grava só os campos
 * alterados - ver `salvarProdutosEditados`. */
export async function salvarProdutoAction(
  produto: Produto,
  original?: Produto
): Promise<{ ok: true; aviso?: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "cadastros");
    await exigirLimiteRequisicao("salvar_produtos");
    const entrada = validarEntrada(produtoSchema, produto);
    if (await prePreparoBloqueadoPeloCardapio(acesso, [entrada])) return { erro: MENSAGEM_PRE_PREPARO_SEM_CARDAPIO };
    await salvarProdutosEditados([{ produto: entrada, original: originalParaComparar(original, entrada.sku) }], acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "produto",
      entidadeId: entrada.sku,
      dadosNovos: entrada,
    });
    revalidarTudo();
    await sincronizarRevendaMelhorEsforco(acesso, [entrada]);
    const avisoPrePreparo = await sincronizarPrePreparoDaGrade(acesso, [entrada]);
    return avisoPrePreparo ? { ok: true, aviso: avisoPrePreparo } : { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar o produto.") };
  }
}

/** Atribui o Fornecedor 1 de um produto que ainda não tinha nenhum
 * fornecedor cadastrado - usado no bloco "Sem fornecedor cadastrado" de
 * Criar Cotação, pra completar o cadastro sem precisar ir em Produtos >
 * Edição de Dados. Lê o produto só para conferir que existe e auditar o
 * valor anterior; no banco grava apenas a coluna Fornecedor 1, sem regravar
 * a linha inteira (parecer do Codex de 24/10/2026). */
export async function definirFornecedor1Action(
  sku: string,
  fornecedor1: string
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "estoque");
    await exigirLimiteRequisicao("salvar_produtos");
    const entrada = validarEntrada(fornecedor1Schema, { sku, fornecedor1 });
    const produtos = await listProdutos(acesso.spreadsheetId);
    const produto = produtos.find((p) => p.sku === entrada.sku);
    if (!produto) return { erro: "Produto não encontrado - a lista pode ter mudado, recarrega a página." };

    await definirFornecedor1NoProduto(produto, entrada.fornecedor1, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "definir_fornecedor_via_cotacao",
      entidade: "produto",
      entidadeId: entrada.sku,
      dadosAntigos: { fornecedor1: produto.fornecedor1 },
      dadosNovos: { fornecedor1: entrada.fornecedor1 },
    });
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel definir o fornecedor.") };
  }
}

/** Exclui o produto do cadastro - também remove ele de qualquer Ficha
 * Técnica que o usa como componente (a Ficha Técnica bloqueia excluir uma
 * ficha em uso, mas aqui é o cliente excluindo o produto: o pedido foi pra
 * remover em cascata, não bloquear). A confirmação com esse aviso já
 * acontece na UI antes de chamar isso. */
export async function excluirProdutoAction(
  sku: string
): Promise<{ ok: true; fichasAfetadas: number } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "cadastros");
    await exigirLimiteRequisicao("excluir_produto");
    const skuValidado = validarEntrada(skuSchema, sku).toUpperCase().trim();
    const fichasAfetadas = await excluirProduto(skuValidado, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "excluir",
      entidade: "produto",
      entidadeId: skuValidado,
      dadosNovos: { fichasAfetadas },
    });
    revalidarTudo();
    return { ok: true, fichasAfetadas };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel excluir o produto.") };
  }
}

/** Versão em lote de `salvarProdutoAction` - "Salvar todos" da grade de
 * Edição de Dados chamava a versão individual uma vez por linha alterada
 * em paralelo (2 idas ao Sheets cada + 1 auditoria cada); com mais de ~10
 * linhas isso esbarrava em limite de taxa da API e ficava visivelmente
 * lento. Aqui é 1 leitura + 1 escrita em lote + 1 auditoria em lote,
 * não importa quantas linhas mudaram. */
export async function salvarProdutosAction(
  produtos: Produto[],
  /** Mesmo índice de `produtos`: o produto como a grade o carregou. */
  originais?: (Produto | undefined)[]
): Promise<{ ok: true; aviso?: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "cadastros");
    await exigirLimiteRequisicao("salvar_produtos");
    const entradas = validarEntrada(produtosSchema, produtos);
    if (await prePreparoBloqueadoPeloCardapio(acesso, entradas)) return { erro: MENSAGEM_PRE_PREPARO_SEM_CARDAPIO };
    const lista = Array.isArray(originais) ? originais.slice(0, entradas.length) : [];
    await salvarProdutosEditados(
      entradas.map((produto, i) => ({ produto, original: originalParaComparar(lista[i], produto.sku) })),
      acesso.spreadsheetId
    );
    await registrarAuditoriaBatch(
      entradas.map((produto) => ({
        acesso,
        acao: "salvar",
        entidade: "produto",
        entidadeId: produto.sku,
        dadosNovos: produto,
      }))
    );
    revalidarTudo();
    await sincronizarRevendaMelhorEsforco(acesso, entradas);
    const avisoPrePreparo = await sincronizarPrePreparoDaGrade(acesso, entradas);
    return avisoPrePreparo ? { ok: true, aviso: avisoPrePreparo } : { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar os produtos.") };
  }
}
