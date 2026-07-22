import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-azul-noite px-4">
      <div className="w-full max-w-sm rounded-lg bg-branco p-6">
        <img
          src="/brand/zatti-logo-invertida.svg"
          alt="Zatti Hub"
          className="mx-auto h-8 w-auto rounded bg-azul-noite p-1.5"
        />
        <p className="mt-3 text-center text-sm text-cinza-medio">
          Digite seu email pra receber um link de acesso.
        </p>
        <div className="mt-5">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
