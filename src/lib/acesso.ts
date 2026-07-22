import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "gestao" | "operacional" | "master";

/** Nome do cookie que guarda qual organização a pessoa escolheu ver, pra
 * quem tem acesso a mais de uma (master, ou alguém com vínculo em dois
 * clientes). Só um hint de preferência - nunca é a fonte da autorização,
 * `getAcessoAtual` sempre confere contra o banco (vínculo real, ou RLS no
 * caso de master). */
const COOKIE_ORGANIZACAO = "zh_org";

export type AcessoAtual = {
  userId: string;
  organizacaoId: string;
  organizacaoNome: string;
  unidadeId: string;
  unidadeNome: string;
  spreadsheetId: string;
  role: Role;
  /** Todas as organizações que essa pessoa pode ver - mais de uma linha
   * aqui é o sinal pra mostrar o seletor no cabeçalho. Pra role "master"
   * são todas as organizações ativas da plataforma; pra role normal, só as
   * que têm vínculo. */
  organizacoesDisponiveis: { id: string; nome: string }[];
};

type VinculoRow = {
  organizacao_id: string;
  unidade_id: string | null;
  role: Role;
  organizacoes: { nome: string } | null;
};

type OrganizacaoRow = { id: string; nome: string };

type UnidadeRow = {
  id: string;
  nome: string;
  spreadsheet_id: string | null;
};

/** Resolve quem está logado e a que organização/unidade ele tem acesso,
 * direto da sessão - nunca a partir de um id vindo de formulário ou da URL.
 * Redireciona pra fora de qualquer página protegida se não achar sessão ou
 * vínculo ativo. Cacheado por request (React `cache`) pra não bater no
 * banco mais de uma vez quando layout e página chamam isso na mesma
 * renderização. */
export const getAcessoAtual = cache(async (): Promise<AcessoAtual> => {
  const supabase = await createClient();
  const { data: claims, error: erroClaims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (erroClaims || !userId) redirect("/login");

  const { data: vinculosData } = await supabase
    .from("vinculos")
    .select("organizacao_id, unidade_id, role, organizacoes(nome)")
    .eq("user_id", userId)
    .eq("status", "ativo");

  const vinculos = (vinculosData as unknown as VinculoRow[] | null) ?? [];
  if (vinculos.length === 0) redirect("/sem-acesso");

  const ehMaster = vinculos.some((v) => v.role === "master");
  const cookieStore = await cookies();
  const orgEscolhida = cookieStore.get(COOKIE_ORGANIZACAO)?.value;

  let organizacoesDisponiveis: { id: string; nome: string }[];
  let organizacaoId: string;
  let role: Role;

  if (ehMaster) {
    // Master enxerga toda organização ativa da plataforma, sem precisar de
    // um vínculo por cliente - RLS em `organizacoes`/`unidades` já dá esse
    // acesso pra quem tem qualquer vínculo com role "master".
    const { data: todasOrgs } = await supabase
      .from("organizacoes")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    organizacoesDisponiveis = (todasOrgs as unknown as OrganizacaoRow[] | null) ?? [];
    if (organizacoesDisponiveis.length === 0) redirect("/sem-acesso");
    organizacaoId =
      organizacoesDisponiveis.find((o) => o.id === orgEscolhida)?.id ??
      organizacoesDisponiveis[0].id;
    role = "master";
  } else {
    organizacoesDisponiveis = vinculos.map((v) => ({
      id: v.organizacao_id,
      nome: v.organizacoes?.nome ?? "",
    }));
    const vinculo =
      vinculos.find((v) => v.organizacao_id === orgEscolhida) ?? vinculos[0];
    organizacaoId = vinculo.organizacao_id;
    role = vinculo.role;
  }

  // unidade_id do vínculo específico só existe fora do caso master (que já
  // resolveu a organização acima, não uma unidade específica) - busca a
  // primeira unidade ativa dessa organização por padrão nos dois casos,
  // exceto quando o vínculo trava numa unidade única.
  const vinculoDaOrg = vinculos.find((v) => v.organizacao_id === organizacaoId);
  const unidadeFixa = !ehMaster ? vinculoDaOrg?.unidade_id ?? null : null;

  const unidadeQuery = unidadeFixa
    ? supabase
        .from("unidades")
        .select("id, nome, spreadsheet_id")
        .eq("id", unidadeFixa)
        .eq("ativo", true)
        .limit(1)
    : supabase
        .from("unidades")
        .select("id, nome, spreadsheet_id")
        .eq("organizacao_id", organizacaoId)
        .eq("ativo", true)
        .order("id")
        .limit(1);

  const { data: unidades } = await unidadeQuery;
  const unidade = (unidades as unknown as UnidadeRow[] | null)?.[0];
  if (!unidade) redirect("/sem-acesso");
  if (!unidade.spreadsheet_id) redirect("/planilha-pendente");

  return {
    userId,
    organizacaoId,
    organizacaoNome:
      organizacoesDisponiveis.find((o) => o.id === organizacaoId)?.nome ?? "",
    unidadeId: unidade.id,
    unidadeNome: unidade.nome,
    spreadsheetId: unidade.spreadsheet_id,
    role,
    organizacoesDisponiveis,
  };
});

/** Barreira real pras telas/ações só de Gestão (master conta como gestão em
 * qualquer organização) - chamar tanto no layout (esconde navegação)
 * quanto dentro de cada Server Action que grava dado (impede a escrita
 * mesmo que alguém chame a action direto, sem passar pela tela). */
export async function requireGestao(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (acesso.role !== "gestao" && acesso.role !== "master") redirect("/estoque/contagem");
  return acesso;
}

/** Log mínimo de auditoria: quem mudou o quê, quando, em qual unidade. Uma
 * falha aqui nunca deve derrubar a ação de verdade do usuário, por isso
 * engole o erro (só loga no servidor). */
export async function registrarAuditoria(params: {
  acesso: AcessoAtual;
  acao: string;
  entidade: string;
  entidadeId: string;
  dadosAntigos?: unknown;
  dadosNovos?: unknown;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("logs_auditoria").insert({
      unidade_id: params.acesso.unidadeId,
      user_id: params.acesso.userId,
      acao: params.acao,
      entidade: params.entidade,
      entidade_id: params.entidadeId,
      dados_antigos: params.dadosAntigos ?? null,
      dados_novos: params.dadosNovos ?? null,
    });
  } catch (err) {
    console.error("Falha ao gravar log de auditoria:", err);
  }
}
