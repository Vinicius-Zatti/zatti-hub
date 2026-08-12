import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Client com `service_role` - só existe pra chamar a Auth Admin API
 * (convidar usuário novo), que é a única coisa que não dá pra fazer com a
 * sessão normal do master nem com uma função `SECURITY DEFINER` no
 * Postgres (Auth roda fora do banco). O `import "server-only"` faz o build
 * falhar se algum dia esse módulo for importado, direto ou indiretamente,
 * por um componente cliente - não depender só de convenção.
 *
 * Nunca reexportar a instância nem a chave. Cada função aqui recebe o que
 * precisa e devolve só o dado necessário - nunca a resposta bruta da Auth
 * API, que pode carregar metadata sensível. */
function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("Configuração administrativa do Supabase ausente.");
  }
  return createSupabaseClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ConviteResultado =
  | { ok: true; userId: string }
  | { ok: false; erro: string };

/** Convida um e-mail novo (fluxo oficial do Supabase - e-mail com link pra
 * criar senha em `/redefinir-senha`, nunca uma senha temporária). Chamar
 * só depois de confirmar via `admin_buscar_usuario_por_email` que o e-mail
 * ainda não tem conta - convidar um e-mail existente não é o uso previsto
 * aqui e cada chamada já consome cota/rate limit da Auth API. */
export async function convidarUsuarioNovo(email: string): Promise<ConviteResultado> {
  const admin = criarClienteAdmin();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    return { ok: false, erro: error?.message ?? "Falha ao enviar convite." };
  }
  return { ok: true, userId: data.user.id };
}
