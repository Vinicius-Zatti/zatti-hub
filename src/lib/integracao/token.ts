import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Integração com o Vini (Financeiro V2, 11/10/2026): token no cabeçalho Authorization, com escopo
// ('caixa_entrada' ou 'alertas'), comparado por SHA-256 numa tabela sem grant. Nunca na URL.

export type EscopoIntegracao = "caixa_entrada" | "alertas";

export async function tokenValido(request: NextRequest, escopo: EscopoIntegracao): Promise<boolean> {
  const cabecalho = request.headers.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  if (token.length < 32 || token.length > 200) return false;
  const { data, error } = await createAdminClient().rpc("fin_integracao_token_valido", { p_token: token, p_escopo: escopo });
  if (error) {
    console.error("integracao_token_falhou", { codigo: error.code ?? null });
    return false;
  }
  return data === true;
}
