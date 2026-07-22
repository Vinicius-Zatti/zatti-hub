"use server";

import { listFornecedores, upsertFornecedor, proximoCodigo } from "@/lib/sheets/fornecedores";
import type { Fornecedor } from "@/lib/types";
import { requireGestao, registrarAuditoria } from "@/lib/acesso";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function revalidarTudo() {
  revalidatePath("/estoque/fornecedores");
  revalidatePath("/estoque/fornecedores/edicao");
  revalidatePath("/estoque/produtos/edicao");
  revalidatePath("/estoque/pedidos");
}

export async function criarFornecedorAction(formData: FormData) {
  const acesso = await requireGestao();
  const existentes = await listFornecedores(acesso.spreadsheetId);

  const fornecedor: Fornecedor = {
    codigo: proximoCodigo(existentes),
    razaoSocial: String(formData.get("razaoSocial") ?? ""),
    nomeFantasia: String(formData.get("nomeFantasia") ?? ""),
    grupos: formData.getAll("grupos").map(String),
    nomeVendedor: String(formData.get("nomeVendedor") ?? ""),
    whatsapp: String(formData.get("whatsapp") ?? ""),
    condicoesPagamento: String(formData.get("condicoesPagamento") ?? ""),
    prazoBoleto: String(formData.get("prazoBoleto") ?? ""),
    limiteCredito: formData.get("limiteCredito") ? Number(formData.get("limiteCredito")) : null,
    pedidoMinimo: formData.get("pedidoMinimo") ? Number(formData.get("pedidoMinimo")) : null,
    diasEntrega: String(formData.get("diasEntrega") ?? ""),
    observacoes: String(formData.get("observacoes") ?? ""),
  };

  await upsertFornecedor(fornecedor, acesso.spreadsheetId);
  await registrarAuditoria({
    acesso,
    acao: "criar",
    entidade: "fornecedor",
    entidadeId: fornecedor.codigo,
    dadosNovos: fornecedor,
  });
  revalidarTudo();
  redirect("/estoque/fornecedores");
}

/** Cria ou atualiza um fornecedor (por Código) direto da grade de Edição de
 * Dados. */
export async function salvarFornecedorAction(
  fornecedor: Fornecedor
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await upsertFornecedor(fornecedor, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "fornecedor",
      entidadeId: fornecedor.codigo,
      dadosNovos: fornecedor,
    });
    revalidarTudo();
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}
