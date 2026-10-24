import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro, tipoAceito } from "@/lib/auth/confirmar";

/** Confirma link de email (recuperação de senha, convite) pelo token_hash.
 * Diferente do /auth/callback (PKCE), não depende de cookie guardado no
 * navegador que pediu o link: funciona aberto em outro aparelho, no app do
 * Gmail ou em outro navegador. Usada pelos templates de email do Supabase. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const tipo = tipoAceito(searchParams.get("type"));
  const next = destinoSeguro(searchParams.get("next"));

  if (tokenHash && tipo) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
}
