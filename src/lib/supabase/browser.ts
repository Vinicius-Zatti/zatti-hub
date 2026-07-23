import { createBrowserClient } from "@supabase/ssr";

/** Client do Supabase pro navegador - usado nas telas de login, esqueci
 * minha senha e redefinir senha. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
