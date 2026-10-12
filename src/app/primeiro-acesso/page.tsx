import Image from "next/image";
import { PrimeiroAcessoForm } from "@/components/equipe/primeiro-acesso-form";

/** Primeiro acesso sem sessão (conta pendente não consegue entrar): e-mail,
 * senha provisória e senha nova. Rota pública e sem redirecionamento: um
 * cookie antigo, de sessão já revogada, não pode criar laço com o app. */
export default function PrimeiroAcessoPage() {
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
