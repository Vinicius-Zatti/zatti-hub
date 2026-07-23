import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Troca o código do link de recuperação de senha pela sessão de verdade.
 * `next` manda pra onde ir depois - hoje só usado pelo fluxo de "esqueci
 * minha senha", que manda pra /redefinir-senha em vez da home. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
}
