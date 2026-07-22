import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "gestao" | "operacional";

export type AcessoAtual = {
  userId: string;
  organizacaoId: string;
  organizacaoNome: string;
  unidadeId: string;
  unidadeNome: string;
  spreadsheetId: string;
  role: Role;
};

type VinculoRow = {
  organizacao_id: string;
  unidade_id: string | null;
  role: Role;
  organizacoes: { nome: string } | null;
};

type UnidadeRow = {
  id: string;
  nome: string;
  spreadsheet_id: string | null;
};

/** Resolve quem está logado e a que unidade ele tem acesso, direto da
 * sessão - nunca a partir de um id vindo de formulário ou da URL. Redireciona
 * pra fora de qualquer página protegida se não achar sessão ou vínculo
 * ativo. Cacheado por request (React `cache`) pra não bater no banco mais
 * de uma vez quando layout e página chamam isso na mesma renderização.
 *
 * Hoje ninguém tem mais de um vínculo ativo nem mais de uma unidade por
 * organização, então pega sempre o primeiro - quando isso deixar de ser
 * verdade (dono de rede, pessoa em dois clientes), este é o lugar certo
 * pra entrar um seletor, não antes. */
export const getAcessoAtual = cache(async (): Promise<AcessoAtual> => {
  const supabase = await createClient();
  const { data: claims, error: erroClaims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (erroClaims || !userId) redirect("/login");

  const { data: vinculos } = await supabase
    .from("vinculos")
    .select("organizacao_id, unidade_id, role, organizacoes(nome)")
    .eq("user_id", userId)
    .eq("status", "ativo")
    .limit(1);

  const vinculo = (vinculos as unknown as VinculoRow[] | null)?.[0];
  if (!vinculo) redirect("/sem-acesso");

  const unidadeQuery = vinculo.unidade_id
    ? supabase
        .from("unidades")
        .select("id, nome, spreadsheet_id")
        .eq("id", vinculo.unidade_id)
        .eq("ativo", true)
        .limit(1)
    : supabase
        .from("unidades")
        .select("id, nome, spreadsheet_id")
        .eq("organizacao_id", vinculo.organizacao_id)
        .eq("ativo", true)
        .order("id")
        .limit(1);

  const { data: unidades } = await unidadeQuery;
  const unidade = (unidades as unknown as UnidadeRow[] | null)?.[0];
  if (!unidade) redirect("/sem-acesso");
  if (!unidade.spreadsheet_id) redirect("/planilha-pendente");

  return {
    userId,
    organizacaoId: vinculo.organizacao_id,
    organizacaoNome: vinculo.organizacoes?.nome ?? "",
    unidadeId: unidade.id,
    unidadeNome: unidade.nome,
    spreadsheetId: unidade.spreadsheet_id,
    role: vinculo.role,
  };
});

/** Barreira real pras telas/ações só de Gestão - chamar tanto no layout
 * (esconde navegação) quanto dentro de cada Server Action que grava dado
 * (impede a escrita mesmo que alguém chame a action direto, sem passar
 * pela tela). */
export async function requireGestao(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (acesso.role !== "gestao") redirect("/estoque/contagem");
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
