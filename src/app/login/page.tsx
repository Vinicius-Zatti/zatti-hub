import Image from "next/image";
import { LoginForm } from "@/components/login-form";

type Parametros = { erro?: string | string[]; senha_redefinida?: string | string[] };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const params = await searchParams;
  // Volta do /auth/callback ou /auth/confirmar com link vencido/já usado, ou
  // do /redefinir-senha depois de trocar a senha: avisa em vez de cair mudo.
  const linkInvalido = params.erro === "link_invalido";
  const senhaRedefinida = params.senha_redefinida === "1";

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
          Digite seu email e senha pra entrar.
        </p>
        {linkInvalido && (
          <p role="alert" className="mt-4 rounded-lg border border-vermelho bg-branco p-3 text-sm text-vermelho">
            Esse link de senha não funcionou. Ele vale uma vez só, por tempo limitado. Peça um novo em
            Esqueci minha senha.
          </p>
        )}
        {senhaRedefinida && !linkInvalido && (
          <p role="status" className="mt-4 rounded-lg border border-verde bg-branco p-3 text-sm text-verde">
            Senha alterada. Entre com a senha nova.
          </p>
        )}
        <div className="mt-5">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
