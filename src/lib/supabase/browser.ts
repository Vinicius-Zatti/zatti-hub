import { createBrowserClient } from "@supabase/ssr";

/** Client do Supabase pro navegador - só usado na tela de login pra disparar
 * o link mágico. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
