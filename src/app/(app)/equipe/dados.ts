import "server-only";
import type { AcessoAtual } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { excecoesDasLinhas, type Excecoes } from "@/lib/permissoes/modulos";
import { vinculoEhDono } from "@/lib/permissoes/dono";
import { carregarTitularOrganizacao } from "@/lib/equipe/titular-servidor";

export type MembroEquipe = {
  vinculoId: string;
  userId: string;
  nome: string | null;
  email: string;
  /** Só os 4 últimos dígitos: o número inteiro não vai para o navegador. */
  whatsappFinal: string | null;
  role: "gestao" | "operacional";
  unidadeId: string | null;
  unidadeNome: string;
  /** ativo | aguardando primeiro acesso | sem acesso */
  situacao: "ativo" | "aguardando" | "revogado";
  envioStatus: "aceito" | "falhou" | "incerto" | null;
  envioEm: string | null;
  ehVoce: boolean;
  /** Exceções gravadas em `permissoes_modulo` (fase 6). Vazio = padrão da função. */
  excecoes: Excecoes;
  /** Este vínculo é o titular marcado pelo master (selo "Titular"). */
  ehTitular: boolean;
  /** A conta é a do titular: senha provisória, editar e tirar acesso só o master. */
  contaTitular: boolean;
  /** Dono: o titular ou, sem titular marcado, a gestão da organização inteira. */
  ehDono: boolean;
};

/** Lista a equipe do cliente da sessão. Chamar só depois de `requireEquipe()`
 * (o client admin ignora RLS; o recorte é feito aqui, pela sessão). Gestor
 * preso a uma unidade vê só a equipe dela. Master não aparece. */
export async function carregarEquipe(acesso: AcessoAtual): Promise<{
  membros: MembroEquipe[];
  unidades: { id: string; nome: string }[];
}> {
  const admin = createAdminClient();

  let consultaUnidades = admin
    .from("unidades")
    .select("id, nome")
    .eq("organizacao_id", acesso.organizacaoId)
    .eq("ativo", true)
    .order("nome");
  if (acesso.unidadeFixa) consultaUnidades = consultaUnidades.eq("id", acesso.unidadeFixa);

  let consultaVinculos = admin
    .from("vinculos")
    .select("id, user_id, unidade_id, role, status, whatsapp, acesso_envio_status, acesso_envio_em, created_at")
    .eq("organizacao_id", acesso.organizacaoId)
    .neq("role", "master")
    .order("created_at");
  if (acesso.unidadeFixa) consultaVinculos = consultaVinculos.eq("unidade_id", acesso.unidadeFixa);

  const [{ data: unidadesData, error: erroUnidades }, { data: vinculosData, error: erroVinculos }, titular] =
    await Promise.all([consultaUnidades, consultaVinculos, carregarTitularOrganizacao(admin, acesso.organizacaoId)]);
  if (erroUnidades || erroVinculos) throw new Error("Não foi possível carregar a equipe.");

  const unidades = (unidadesData ?? []) as { id: string; nome: string }[];
  const vinculos = (vinculosData ?? []) as {
    id: string;
    user_id: string;
    unidade_id: string | null;
    role: "gestao" | "operacional";
    status: "ativo" | "convidado" | "revogado";
    whatsapp: string | null;
    acesso_envio_status: MembroEquipe["envioStatus"];
    acesso_envio_em: string | null;
  }[];

  const userIds = [...new Set(vinculos.map((v) => v.user_id))];
  const vinculoIds = vinculos.map((v) => v.id);
  const [{ data: perfisData }, contas, { data: pendentesData }, permissoesRes] = await Promise.all([
    userIds.length
      ? admin.from("perfis").select("id, nome").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; nome: string | null }[] }),
    Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id))),
    // Conta ativa que recebeu senha provisória (24/10) volta a aguardar o primeiro acesso.
    userIds.length
      ? admin.from("senhas_temporarias").select("user_id").in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    vinculoIds.length
      ? admin.from("permissoes_modulo").select("vinculo_id, modulo, nivel").in("vinculo_id", vinculoIds)
      : Promise.resolve({ data: [] as { vinculo_id: string; modulo: string; nivel: string }[], error: null }),
  ]);
  // Tabela ainda não criada (SQL da fase 6 não rodou): todo mundo no padrão, como no banco.
  const erroPermissoes = (permissoesRes as { error: { code?: string } | null }).error;
  if (erroPermissoes && erroPermissoes.code !== "42P01" && erroPermissoes.code !== "PGRST205") {
    throw new Error("Não foi possível carregar as permissões da equipe.");
  }
  const linhasPermissao = ((permissoesRes.data ?? []) as { vinculo_id: string; modulo: string; nivel: string }[]);
  const pendentes = new Set(((pendentesData ?? []) as { user_id: string }[]).map((p) => p.user_id));
  const nomes = new Map(((perfisData ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
  const emails = new Map(contas.map((c, i) => [userIds[i], c.data.user?.email ?? ""]));
  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]));

  const membros: MembroEquipe[] = vinculos.map((v) => ({
    vinculoId: v.id,
    userId: v.user_id,
    nome: nomes.get(v.user_id) ?? null,
    email: emails.get(v.user_id) ?? "",
    whatsappFinal: v.whatsapp ? v.whatsapp.slice(-4) : null,
    role: v.role,
    unidadeId: v.unidade_id,
    unidadeNome: v.unidade_id ? nomeUnidade.get(v.unidade_id) ?? v.unidade_id : "Todas as unidades",
    situacao:
      v.status === "revogado"
        ? "revogado"
        : v.status === "convidado" || pendentes.has(v.user_id)
          ? "aguardando"
          : "ativo",
    envioStatus: v.acesso_envio_status,
    envioEm: v.acesso_envio_em,
    ehVoce: v.user_id === acesso.userId,
    excecoes: excecoesDasLinhas(linhasPermissao.filter((l) => l.vinculo_id === v.id)),
    ehTitular: titular?.vinculoId === v.id,
    contaTitular: titular?.userId === v.user_id,
    ehDono: vinculoEhDono({ id: v.id, role: v.role, unidadeId: v.unidade_id, status: v.status }, titular?.vinculoId ?? null),
  }));

  return { membros, unidades };
}
