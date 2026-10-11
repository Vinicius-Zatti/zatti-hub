import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrimeiroAcessoForm } from "@/components/equipe/primeiro-acesso-form";

/** Fora do grupo (app) de propósito: lá `getAcessoAtual` manda a conta
 * pendente pra cá, e aqui não há dado de cliente nenhum para mostrar. Quem
 * não tem pendência e cai aqui segue para o app. */
export default async function PrimeiroAcessoPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect("/login");

  const { data: vinculos } = await supabase.from("vinculos").select("status").eq("user_id", userId);
  const lista = (vinculos ?? []) as { status: string }[];
  if (!lista.some((v) => v.status === "convidado") && lista.some((v) => v.status === "ativo")) redirect("/");

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
