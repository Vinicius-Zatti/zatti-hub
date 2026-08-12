import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaForm } from "@/components/mfa-form";

/** Cadastro/desafio de MFA (TOTP) - obrigatório pra quem tem papel
 * `master` (o RLS já bloqueia dado de verdade em `aal1`, isso aqui é só a
 * tela pra chegar em `aal2`). Não usa `getAcessoAtual()` de propósito -
 * ela redireciona master sem AAL2 pra cá, então checar sessão direto no
 * Supabase evita loop de redirecionamento. */
export default async function MfaPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/");

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-azul-noite px-4">
      <div className="w-full max-w-sm rounded-lg bg-branco p-6">
        <Image
          src="/brand/zatti-hub-fundo-escuro.svg"
          alt="Zatti Hub"
          width={1600}
          height={900}
          priority
          className="mx-auto w-full rounded-lg"
        />
        <p className="mt-3 text-center text-sm text-cinza-medio">
          Confirmação em duas etapas obrigatória pra essa conta.
        </p>
        <div className="mt-5">
          <MfaForm />
        </div>
      </div>
    </div>
  );
}
