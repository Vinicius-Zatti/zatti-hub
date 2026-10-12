import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrimeiroAcessoForm } from "@/components/equipe/primeiro-acesso-form";

/** Primeiro acesso sem sessão (conta pendente não consegue entrar): e-mail,
 * senha provisória e senha nova. Rota pública. Quem já está logado vai para o app. */
export default async function PrimeiroAcessoPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.sub) redirect("/");

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
          Bem-vindo ao Zatti Hub. Antes de começar, crie a sua senha.
        </p>
        <div className="mt-5">
          <PrimeiroAcessoForm />
        </div>
      </div>
    </div>
  );
}
