import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Client Supabase com a service role - bypassa RLS por design (é o papel
 * de confiança administrativa da plataforma, nunca de um usuário comum).
 * `import "server-only"` garante que qualquer import acidental a partir de
 * um Client Component quebra o build, antes de virar um vazamento de
 * verdade no bundle do navegador.
 *
 * Só usar aqui dentro do painel `/acessos`, sempre depois de `requireMaster()`
 * já ter confirmado quem está pedindo - este client não confere papel
 * nenhum sozinho, ele so ignora RLS. A barreira de autorização é sempre a
 * chamada a `requireMaster()` em cada Server Action, nunca este client. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) não configurada neste ambiente."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
