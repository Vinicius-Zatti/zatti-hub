import { createBrowserClient } from "@supabase/ssr";

/** Client do Supabase pro navegador - usado nas telas de login, esqueci
 * minha senha e redefinir senha. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `secure` força HTTPS em produção (em dev, http://localhost, fica
      // desligado senão o navegador descarta o cookie). Mesma configuração
      // de `@/lib/supabase/server` e do middleware - os três precisam
      // combinar, senão um client sobrescreve o cookie do outro com opções
      // diferentes a cada request.
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    }
  );
}
