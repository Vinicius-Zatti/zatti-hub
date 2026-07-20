"use server";

import { upsertProduto } from "@/lib/sheets/produtos";
import { sugerirSku } from "@/lib/skus/sugerir";
import type { Produto } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function sugerirSkuAction(
  grupo: string,
  nome: string
): Promise<{ sku: string; motivo: string } | { erro: string }> {
  try {
    return await sugerirSku(grupo, nome);
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
  };

  await upsertProduto(produto);
  revalidatePath("/estoque/produtos");
  redirect("/estoque/produtos");
}
