import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

export type TitularOrganizacao = { vinculoId: string; userId: string } | null;

/** Titular válido da organização (marcado pelo master e ainda gestão ativa), lido com o client
 * admin depois da barreira da tela. Função ainda não criada no banco: sem titular (reserva). */
export async function carregarTitularOrganizacao(
  admin: ReturnType<typeof createAdminClient>,
  organizacaoId: string,
): Promise<TitularOrganizacao> {
  const { data, error } = await admin.rpc("titular_valido_da_organizacao", { p_organizacao_id: organizacaoId });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error("Não foi possível carregar o titular da organização.");
  }
  if (!data) return null;
  const vinculoId = String(data);
  const { data: vinculo, error: erroVinculo } = await admin.from("vinculos").select("user_id").eq("id", vinculoId).maybeSingle();
  if (erroVinculo) throw new Error("Não foi possível carregar o titular da organização.");
  if (!vinculo) return null;
  return { vinculoId, userId: (vinculo as { user_id: string }).user_id };
}
