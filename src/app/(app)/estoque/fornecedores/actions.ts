"use server";

import { listFornecedores, upsertFornecedor, proximoCodigo } from "@/lib/sheets/fornecedores";
import type { Fornecedor } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidarTudo() {
  revalidatePath("/estoque/fornecedores");
  revalidatePath("/estoque/fornecedores/edicao");
  revalidatePath("/estoque/produtos/edicao");
  revalidatePath("/estoque/pedidos");
}

export async function criarFornecedorAction(formData: FormData) {
  const existentes = await listFornecedores();

  const fornecedor: Fornecedor = {
    codigo: proximoCodigo(existentes),
    razaoSocial: String(formData.get("razaoSocial") ?? ""),
    nomeFantasia: String(formData.get("nomeFantasia") ?? ""),
    nomeVendedor: String(formData.get("nomeVendedor") ?? ""),
    whatsapp: String(formData.get("whatsapp") ?? ""),
    condicoesPagamento: String(formData.get("condicoesPagamento") ?? ""),
    prazoBoleto: String(formData.get("prazoBoleto") ?? ""),
    limiteCredito: formData.get("limiteCredito") ? Number(formData.get("limiteCredito")) : null,
    pedidoMinimo: formData.get("pedidoMinimo") ? Number(formData.get("pedidoMinimo")) : null,
    diasEntrega: String(formData.get("diasEntrega") ?? ""),
    observacoes: String(formData.get("observacoes") ?? ""),
  };

  await upsertFornecedor(fornecedor);
  revalidarTudo();
  redirect("/estoque/fornecedores");
}

/** Cria ou atualiza um fornecedor (por Código) direto da grade de Edição de
 * Dados. */
export async function salvarFornecedorAction(
  fornecedor: Fornecedor
): Promise<{ ok: true } | { erro: string }> {
  try {
    await upsertFornecedor(fornecedor);
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}
