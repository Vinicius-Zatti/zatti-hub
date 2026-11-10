import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Integração com o Vini (Financeiro V2, 11/10/2026): token no cabeçalho Authorization, com escopo
// ('caixa_entrada', 'alertas', desde 13/10 'garante' para os avisos do Checklist Garante e, desde
// 15/10, 'provisionamento' para o cadastro automático de quem compra o app; desde 30/10, 'sefaz'
// para o robô da captura de NF-e; desde 09/11, 'equipe' para o Vini dar acesso de equipe),
// comparado por SHA-256 numa tabela sem grant. Nunca na URL.

export type EscopoIntegracao = "caixa_entrada" | "alertas" | "garante" | "provisionamento" | "sefaz" | "equipe";

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

function tokenDoCabecalho(request: NextRequest): string {
  const cabecalho = request.headers.get("authorization") ?? "";
  return cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
}

/** Token que age em nome de alguém (escopo 'equipe', 09/11/2026): devolve a conta master que
 * responde pelo token, ou `null`. O banco só devolve o ator enquanto ele for master ativo. */
export async function tokenAtor(request: NextRequest, escopo: "equipe"): Promise<string | null> {
  const token = tokenDoCabecalho(request);
  if (token.length < 32 || token.length > 200) return null;
  const { data, error } = await createAdminClient().rpc("fin_integracao_token_ator", { p_token: token, p_escopo: escopo });
  if (error) {
    console.error("integracao_token_ator_falhou", { codigo: error.code ?? null });
    return null;
  }
  return typeof data === "string" && data ? data : null;
}
