import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { RemetenteAcesso } from "@/lib/equipe/envio";

/** Regra de Vinícius (18/11/2026): comprou fala com ele; se ele (master) ou o Vini a pedido dele manda
 * ou faz alguma coisa, o cliente é dele e a mensagem é dele. Ator master = número de Vinícius sempre;
 * gestão do cliente mexendo na própria equipe = chip, salvo quando o alvo é comprador ou titular. */
export async function remetenteDoEnvio(
  admin: ReturnType<typeof createAdminClient>,
  atorRole: string,
  userId: string,
): Promise<RemetenteAcesso> {
  return atorRole === "master" ? "vinicius" : remetenteDoAcesso(admin, userId);
}

/** Por qual número sai o acesso desta conta (18/11/2026). Cliente direto de Vinícius recebe pelo
 * WhatsApp dele: quem comprou o app (conta criada pelo provisionamento de compra) e quem é titular
 * marcado de algum cliente, em qualquer status (o titular ainda pendente também conta). Compara pela
 * conta (user_id), não pelo vínculo. Os demais, equipe que o cliente cadastra, pelo chip do Hub.
 * Consulta que falha nunca manda cliente direto pelo chip: na dúvida, número de Vinícius. */
export async function remetenteDoAcesso(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<RemetenteAcesso> {
  try {
    const { data: compra, error: erroCompra } = await admin
      .from("zh_provisionamentos")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (erroCompra || (compra ?? []).length > 0) return "vinicius";

    const { data: vinculos, error: erroVinculos } = await admin.from("vinculos").select("id").eq("user_id", userId);
    if (erroVinculos) return "vinicius";
    const ids = (vinculos ?? []).map((v) => (v as { id: string }).id);
    if (ids.length === 0) return "hub";

    const { data: titular, error: erroTitular } = await admin
      .from("titulares_organizacao")
      .select("vinculo_id")
      .in("vinculo_id", ids)
      .limit(1);
    if (erroTitular || (titular ?? []).length > 0) return "vinicius";
    return "hub";
  } catch {
    return "vinicius";
  }
}
