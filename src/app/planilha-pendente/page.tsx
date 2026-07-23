import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { OrgSwitcher } from "@/components/org-switcher";
import { signOutAction } from "@/lib/supabase/actions";

type VinculoRow = { organizacao_id: string; role: "gestao" | "operacional" | "master" };
type OrganizacaoRow = { id: string; nome: string };

/** Mesma tela de sempre, mas pra quem é master e tem mais de uma
 * organização disponível, mostra o seletor também - sem isso, master ficava
 * preso aqui sem saída sempre que a organização escolhida (ou a primeira,
 * antes da correção em getAcessoAtual) ainda não tinha planilha configurada. */
export default async function PlanilhaPendentePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  let organizacoesDisponiveis: OrganizacaoRow[] = [];
  let organizacaoAtual = "";

  if (userId) {
    const { data: vinculosData } = await supabase
      .from("vinculos")
      .select("organizacao_id, role")
      .eq("user_id", userId)
      .eq("status", "ativo");
    const vinculos = (vinculosData as VinculoRow[] | null) ?? [];
    const ehMaster = vinculos.some((v) => v.role === "master");

    if (ehMaster) {
      const { data: todasOrgs } = await supabase
        .from("organizacoes")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      organizacoesDisponiveis = (todasOrgs as OrganizacaoRow[] | null) ?? [];

      const cookieStore = await cookies();
      const orgEscolhida = cookieStore.get("zh_org")?.value;
      organizacaoAtual =
        organizacoesDisponiveis.find((o) => o.id === orgEscolhida)?.id ??
        organizacoesDisponiveis[0]?.id ??
        "";
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Quase lá</h1>
      <p className="max-w-sm text-sm text-cinza-medio">
        Seu acesso já está liberado. Só falta a gente terminar de configurar os dados do seu
        cadastro - já te avisamos assim que estiver pronto pra usar.
      </p>
      {organizacoesDisponiveis.length > 1 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-cinza-medio">Ou troca pra outra organização:</p>
          <OrgSwitcher organizacoes={organizacoesDisponiveis} atual={organizacaoAtual} />
        </div>
      )}
      <form action={signOutAction}>
        <button type="submit" className="text-sm text-azul-petroleo underline">
          Sair
        </button>
      </form>
    </div>
  );
}
