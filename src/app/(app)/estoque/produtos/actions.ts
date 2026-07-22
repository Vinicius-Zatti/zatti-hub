"use server";

import { upsertProduto } from "@/lib/sheets/produtos";
import { sugerirSku } from "@/lib/skus/sugerir";
import type { Produto } from "@/lib/types";
import { requireGestao, registrarAuditoria } from "@/lib/acesso";
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
    return await sugerirSku(nome, acesso.spreadsheetId);
  } catch (err) {
    return { erro: (err as Error).message };
  }
}

export async function criarProdutoAction(formData: FormData) {
  const acesso = await requireGestao();

  const produto: Produto = {
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
  };

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
    await upsertProduto(produto, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "produto",
      entidadeId: produto.sku,
      dadosNovos: produto,
    });
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}
