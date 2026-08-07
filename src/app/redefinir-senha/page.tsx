import Image from "next/image";
import { RedefinirSenhaForm } from "@/components/redefinir-senha-form";

export default function RedefinirSenhaPage() {
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
        <p className="mt-3 text-center text-sm text-cinza-medio">Escolhe uma senha nova.</p>
        <div className="mt-5">
          <RedefinirSenhaForm />
        </div>
      </div>
    </div>
  );
}
