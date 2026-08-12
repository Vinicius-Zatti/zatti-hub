import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Client do Supabase pro servidor (Server Components, Server Actions,
 * Route Handlers) - sempre criar um novo por request, nunca reaproveitar
 * entre requests. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // `httpOnly` fica no padrão da lib (false) de propósito - o client do
      // navegador (`@/lib/supabase/browser`) precisa ler esse cookie via
      // document.cookie pra renovar sessão sem reload de página. `secure`
      // força HTTPS em produção; em dev (http://localhost) fica desligado
      // senão o navegador simplesmente descarta o cookie.
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component (não pode escrever
            // cookie) - o middleware já cobre a renovação de sessão nesse
            // caso, não precisa propagar o erro.
          }
        },
      },
    }
  );
}
