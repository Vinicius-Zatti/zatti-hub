import Image from "next/image";
import { MfaForm } from "@/components/mfa-form";
import { signOutAction } from "@/lib/supabase/actions";

export default function MfaPage() {
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
        <h1 className="mt-4 text-lg font-semibold text-cinza">Verificacao em duas etapas</h1>
        <p className="mt-1 text-sm text-cinza-medio">
          Contas administrativas precisam confirmar um segundo fator antes de acessar clientes.
        </p>
        <div className="mt-5">
          <MfaForm />
        </div>
        <form action={signOutAction} className="mt-4">
          <button type="submit" className="w-full text-center text-sm text-azul-petroleo underline">
            Sair e usar outra conta
          </button>
        </form>
      </div>
    </div>
  );
}
