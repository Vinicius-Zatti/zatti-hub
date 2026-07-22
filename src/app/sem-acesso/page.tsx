import { signOutAction } from "@/lib/supabase/actions";

export default function SemAcessoPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Sem acesso configurado</h1>
      <p className="max-w-sm text-sm text-cinza-medio">
        Seu login funcionou, mas ainda não tem nenhum cliente vinculado a essa conta. Fala com o
        Vinícius pra liberar o acesso.
      </p>
      <form action={signOutAction}>
        <button type="submit" className="text-sm text-azul-petroleo underline">
          Sair
        </button>
      </form>
    </div>
  );
}
