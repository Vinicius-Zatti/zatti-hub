import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exigirLimite, obterIp } from "@/lib/rate-limit";

/** Só aceita `next` que seja um caminho interno (começa com `/`, nunca
 * `//` nem uma URL absoluta) - sem isso, um link malicioso poderia usar
 * esse endpoint pra redirecionar pra fora do site depois de autenticar
 * (open redirect). */
function proximoSeguro(valor: string | null): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//")) return "/";
  return valor;
}

/** Troca o código do link de recuperação de senha pela sessão de verdade.
 * `next` manda pra onde ir depois - hoje só usado pelo fluxo de "esqueci
 * minha senha", que manda pra /redefinir-senha em vez da home. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = proximoSeguro(searchParams.get("next"));

  try {
    const ip = await obterIp();
    await exigirLimite(`ip:${ip}`, "auth_callback");

    if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  } catch {
    // Rate limit estourado ou falha inesperada: cai no mesmo redirect
    // genérico de link inválido abaixo, sem expor detalhe nenhum.
  }

  return NextResponse.redirect(`${origin}/login?erro=link_invalido`);
}
