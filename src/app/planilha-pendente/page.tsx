import { signOutAction } from "@/lib/supabase/actions";

export default function PlanilhaPendentePage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Quase lá</h1>
      <p className="max-w-sm text-sm text-cinza-medio">
        Seu acesso já está liberado. Só falta a gente terminar de configurar os dados do seu
        cadastro - já te avisamos assim que estiver pronto pra usar.
      </p>
      <form action={signOutAction}>
        <button type="submit" className="text-sm text-azul-petroleo underline">
          Sair
        </button>
      </form>
    </div>
  );
}
