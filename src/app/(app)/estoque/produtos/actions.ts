"use server";

import { excluirProduto, listProdutos, upsertProduto, upsertProdutosBatch } from "@/lib/sheets/produtos";
import { sugerirSku } from "@/lib/skus/sugerir";
import { sincronizarFichasRevenda } from "@/lib/banco/fichas-tecnicas";
import type { Produto } from "@/lib/types";
import { requireGestao, registrarAuditoria, registrarAuditoriaBatch, type AcessoAtual } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  fornecedor1Schema,
  nomeProdutoSchema,
  produtoSchema,
  produtosSchema,
  skuSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";

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

export async function criarProdutoAction(formData: FormData) {
  const acesso = await requireGestao();
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

  await upsertProduto(produto, acesso.spreadsheetId);
  await registrarAuditoria({
    acesso,
    acao: "criar",
    entidade: "produto",
    entidadeId: produto.sku,
    dadosNovos: produto,
  });
  revalidarTudo();
  redirect("/estoque/produtos");
}

/** Cria ou atualiza um produto (por SKU) direto da grade de Edição de Dados. */
export async function salvarProdutoAction(
  produto: Produto
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("salvar_produtos");
    const entrada = validarEntrada(produtoSchema, produto);
    await upsertProduto(entrada, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "produto",
      entidadeId: entrada.sku,
      dadosNovos: entrada,
    });
    revalidarTudo();
    await sincronizarRevendaMelhorEsforco(acesso, [entrada]);
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar o produto.") };
  }
}

/** Atribui o Fornecedor 1 de um produto que ainda não tinha nenhum
 * fornecedor cadastrado - usado no bloco "Sem fornecedor cadastrado" de
 * Criar Cotação, pra completar o cadastro sem precisar ir em Produtos >
 * Edição de Dados. Busca o produto inteiro antes de gravar (a Server
 * Action só recebe o SKU + fornecedor escolhido, não o resto dos campos). */
export async function definirFornecedor1Action(
  sku: string,
  fornecedor1: string
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("salvar_produtos");
    const entrada = validarEntrada(fornecedor1Schema, { sku, fornecedor1 });
    const produtos = await listProdutos(acesso.spreadsheetId);
    const produto = produtos.find((p) => p.sku === entrada.sku);
    if (!produto) return { erro: "Produto não encontrado - a lista pode ter mudado, recarrega a página." };

    const atualizado: Produto = { ...produto, fornecedor1: entrada.fornecedor1 };
    await upsertProduto(atualizado, acesso.spreadsheetId);
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
  produtos: Produto[]
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("salvar_produtos");
    const entradas = validarEntrada(produtosSchema, produtos);
    await upsertProdutosBatch(entradas, acesso.spreadsheetId);
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
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel salvar os produtos.") };
  }
}
