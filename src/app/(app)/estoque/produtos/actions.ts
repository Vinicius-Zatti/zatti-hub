"use server";

import { listProdutos, upsertProduto, upsertProdutosBatch } from "@/lib/sheets/produtos";
import { sugerirSku } from "@/lib/skus/sugerir";
import type { Produto } from "@/lib/types";
import { requireGestao, registrarAuditoria, registrarAuditoriaBatch } from "@/lib/acesso";
import { paraErroPublico, ErroPublico } from "@/lib/erros";
import { exigirLimite, chaveUsuario } from "@/lib/rate-limit";
import {
  validar,
  produtoSchema,
  produtosBatchSchema,
  sugerirSkuSchema,
  definirFornecedor1Schema,
} from "@/lib/validacao";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidarTudo() {
  revalidatePath("/estoque/produtos");
  revalidatePath("/estoque/produtos/edicao");
  revalidatePath("/estoque/pedidos");
  revalidatePath("/estoque/contagem");
}

export async function sugerirSkuAction(
  nome: string
): Promise<{ sku: string; grupo: string; motivo: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimite(chaveUsuario(acesso.userId), "sugerir_sku");
    const nomeValidado = validar(sugerirSkuSchema, nome, "sugerirSkuAction");
    return await sugerirSku(nomeValidado, acesso.spreadsheetId);
  } catch (err) {
    return { erro: paraErroPublico(err, "sugerirSkuAction") };
  }
}

export async function criarProdutoAction(formData: FormData) {
  const acesso = await requireGestao();

  try {
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");

    const produto = validar(
      produtoSchema,
      {
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
      } satisfies Produto,
      "criarProdutoAction"
    );

    await upsertProduto(produto, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "criar",
      entidade: "produto",
      entidadeId: produto.sku,
      dadosNovos: produto,
    });
  } catch (err) {
    redirect(`/estoque/produtos/novo?erro=${encodeURIComponent(paraErroPublico(err, "criarProdutoAction"))}`);
  }
  revalidarTudo();
  redirect("/estoque/produtos");
}

/** Cria ou atualiza um produto (por SKU) direto da grade de Edição de Dados. */
export async function salvarProdutoAction(
  produto: Produto
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const produtoValidado = validar(produtoSchema, produto, "salvarProdutoAction");
    await upsertProduto(produtoValidado, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "produto",
      entidadeId: produtoValidado.sku,
      dadosNovos: produtoValidado,
    });
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "salvarProdutoAction") };
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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(definirFornecedor1Schema, { sku, fornecedor1 }, "definirFornecedor1Action");

    const produtos = await listProdutos(acesso.spreadsheetId);
    const produto = produtos.find((p) => p.sku === dados.sku);
    if (!produto) throw new ErroPublico("Produto não encontrado - a lista pode ter mudado, recarrega a página.");

    const atualizado: Produto = { ...produto, fornecedor1: dados.fornecedor1 };
    await upsertProduto(atualizado, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "definir_fornecedor_via_cotacao",
      entidade: "produto",
      entidadeId: dados.sku,
      dadosAntigos: { fornecedor1: produto.fornecedor1 },
      dadosNovos: { fornecedor1: dados.fornecedor1 },
    });
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "definirFornecedor1Action") };
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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const produtosValidados = validar(produtosBatchSchema, produtos, "salvarProdutosAction");
    await upsertProdutosBatch(produtosValidados, acesso.spreadsheetId);
    await registrarAuditoriaBatch(
      produtosValidados.map((produto) => ({
        acesso,
        acao: "salvar",
        entidade: "produto",
        entidadeId: produto.sku,
        dadosNovos: produto,
      }))
    );
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "salvarProdutosAction") };
  }
}
