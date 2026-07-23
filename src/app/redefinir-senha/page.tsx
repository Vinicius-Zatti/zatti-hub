import { RedefinirSenhaForm } from "@/components/redefinir-senha-form";

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-azul-noite px-4">
      <div className="w-full max-w-sm rounded-lg bg-branco p-6">
        <img
          src="/brand/zatti-logo-invertida.svg"
          alt="Zatti Hub"
          className="mx-auto h-8 w-auto rounded bg-azul-noite p-1.5"
        />
        <p className="mt-3 text-center text-sm text-cinza-medio">Escolhe uma senha nova.</p>
        <div className="mt-5">
          <RedefinirSenhaForm />
        </div>
      </div>
    </div>
  );
}
