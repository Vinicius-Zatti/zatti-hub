"use server";

import { upsertProduto } from "@/lib/sheets/produtos";
import { sugerirSku } from "@/lib/skus/sugerir";
import type { Produto } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidarTudo() {
  revalidatePath("/estoque/produtos");
  revalidatePath("/estoque/edicao");
  revalidatePath("/estoque/pedidos");
  revalidatePath("/estoque/contagem");
}

export async function sugerirSkuAction(
  nome: string
): Promise<{ sku: string; grupo: string; motivo: string } | { erro: string }> {
  try {
    return await sugerirSku(nome);
  } catch (err) {
    return { erro: (err as Error).message };
  }
}

export async function criarProdutoAction(formData: FormData) {
  const produto: Produto = {
    sku: String(formData.get("sku") ?? "").toUpperCase().trim(),
    grupo: String(formData.get("grupo") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    nomeCompra: String(formData.get("nomeCompra") ?? ""),
    unidadeBase: String(formData.get("unidadeBase") ?? "UN"),
    precoUnitario: formData.get("precoUnitario") ? Number(formData.get("precoUnitario")) : null,
    precoFornecedor: null,
    estoqueNecessarioSemana: formData.get("estoqueNecessarioSemana")
      ? Number(formData.get("estoqueNecessarioSemana"))
      : null,
    estoqueMinimo: formData.get("estoqueMinimo") ? Number(formData.get("estoqueMinimo")) : null,
    fornecedor1: "",
    fornecedor2: "",
    fornecedor3: "",
    fornecedor4: "",
    observacoes: String(formData.get("observacoes") ?? ""),
    ativo: true,
    posicao: formData.get("posicao") ? Number(formData.get("posicao")) : null,
  };

  await upsertProduto(produto);
  revalidarTudo();
  redirect("/estoque/produtos");
}

/** Cria ou atualiza um produto (por SKU) direto da grade de Edição de Dados. */
export async function salvarProdutoAction(
  produto: Produto
): Promise<{ ok: true } | { erro: string }> {
  try {
    await upsertProduto(produto);
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}
