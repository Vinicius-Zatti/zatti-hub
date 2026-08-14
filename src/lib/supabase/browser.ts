import { createBrowserClient } from "@supabase/ssr";

/** Client do Supabase pro navegador - usado nas telas de login, esqueci
 * minha senha e redefinir senha. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // O SDK do Supabase precisa renovar a sessao no navegador; por isso os
      // cookies de Auth nao podem ser HttpOnly. Secure + SameSite e CSP
      // reduzem o risco, enquanto a autorizacao real permanece no RLS.
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}
