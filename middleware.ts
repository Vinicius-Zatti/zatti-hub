import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CABECALHO_CAMINHO } from "@/lib/area-interna/caminhos";

// As rotas do relatório semanal de IA, dos eventos de leads e do Conteúdo se autenticam por token próprio (conferido
// no banco), não por sessão: são chamadas pelo Vini, fora do navegador.
const ROTAS_PUBLICAS = ["/login", "/primeiro-acesso", "/auth/callback", "/sem-acesso", "/esqueci-senha", "/api/conciliacao/uso-ia/semanal", "/api/leads/eventos", "/api/conteudo/pecas"];
// Financeiro V2 (11/10/2026): Caixa de Entrada e alerta diário, token com escopo próprio. Comparação
// exata (não por prefixo): rota nova embaixo delas não fica sem sessão por acidente.
const ROTAS_PUBLICAS_EXATAS = new Set([
  "/api/financeiro/caixa-entrada", "/api/financeiro/caixa-entrada/config", "/api/financeiro/caixa-entrada/pastas",
  "/api/financeiro/alertas/diario", "/api/financeiro/alertas/enviados",
  // Compra do app com cadastro automático (15/10/2026): token do escopo 'provisionamento'.
  "/api/provisionamento/compra",
]);

/** Renova a sessão do Supabase a cada request e barra quem não está logado
 * antes de qualquer página renderizar - primeira camada, não a única (cada
 * Server Action que grava dado confere de novo, ver src/lib/acesso.ts). */
export async function middleware(request: NextRequest) {
  // Caminho da página para o layout escolher o menu (área do Vinícius x
  // restaurante). Sempre sobrescrito aqui: o valor do navegador não vale.
  request.headers.set(CABECALHO_CAMINHO, request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims);
  const rotaPublica =
    ROTAS_PUBLICAS.some((rota) => request.nextUrl.pathname.startsWith(rota)) || ROTAS_PUBLICAS_EXATAS.has(request.nextUrl.pathname);

  if (!logado && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|brand/).*)"],
};
