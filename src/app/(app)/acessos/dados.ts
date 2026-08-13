import "server-only";
import { requireMaster } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrganizacaoPainel = {
  id: string;
  nome: string;
  tipoCliente: string;
  ativo: boolean;
  totalUnidades: number;
};

export type UnidadePainel = {
  id: string;
  organizacaoId: string;
  organizacaoNome: string;
  nome: string;
  fonteDadosEstoque: string;
  spreadsheetId: string | null;
  consolidadoVendasHabilitado: boolean;
  ativo: boolean;
};

export type VinculoPainel = {
  id: string;
  userId: string;
  email: string;
  nome: string | null;
  organizacaoId: string;
  organizacaoNome: string;
  unidadeId: string | null;
  unidadeNome: string | null;
  role: string;
  status: string;
  confirmado: boolean;
  criadoEm: string;
};

export type PainelAcessos = {
  organizacoes: OrganizacaoPainel[];
  unidades: UnidadePainel[];
  vinculos: VinculoPainel[];
};

/** Carrega todo o dado do Painel de Acessos via service role (RLS não tem
 * policy de escrita/leitura ampla nessas tabelas hoje - a barreira real é
 * `requireMaster()`, chamado aqui de novo mesmo essa função só sendo usada
 * a partir de páginas que já passaram pelo layout de `/acessos`). Lista até
 * 1000 usuários do Auth numa página só - teto conveniente pro tamanho atual
 * do app, não paginação de verdade (ver `buscarUsuarioPorEmail` em
 * `actions.ts`, que pagina de verdade pro fluxo de convite). */
export async function carregarPainelAcessos(): Promise<PainelAcessos> {
  await requireMaster();
  const admin = createAdminClient();

  const [orgsResp, unidadesResp, vinculosResp, usuariosResp] = await Promise.all([
    admin.from("organizacoes").select("id, nome, tipo_cliente, ativo").order("nome"),
    admin
      .from("unidades")
      .select("id, organizacao_id, nome, fonte_dados_estoque, spreadsheet_id, consolidado_vendas_habilitado, ativo")
      .order("nome"),
    admin.from("vinculos").select("id, user_id, organizacao_id, unidade_id, role, status, created_at").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (orgsResp.error) throw new Error(orgsResp.error.message);
  if (unidadesResp.error) throw new Error(unidadesResp.error.message);
  if (vinculosResp.error) throw new Error(vinculosResp.error.message);
  if (usuariosResp.error) throw new Error(usuariosResp.error.message);

  const organizacoesBrutas = orgsResp.data ?? [];
  const unidadesBrutas = unidadesResp.data ?? [];
  const vinculosBrutos = vinculosResp.data ?? [];

  const userIds = Array.from(new Set(vinculosBrutos.map((v) => v.user_id)));
  const { data: perfis, error: erroPerfis } = await admin
    .from("perfis")
    .select("id, nome")
    .in("id", userIds.length ? userIds : ["__nenhum__"]);
  if (erroPerfis) throw new Error(erroPerfis.message);

  const orgNomePorId = new Map(organizacoesBrutas.map((o) => [o.id, o.nome as string]));
  const unidadeNomePorId = new Map(unidadesBrutas.map((u) => [u.id, u.nome as string]));
  const perfilNomePorId = new Map((perfis ?? []).map((p) => [p.id, p.nome as string | null]));
  const usuarioPorId = new Map(
    usuariosResp.data.users.map((u) => [u.id, { email: u.email ?? "", confirmado: Boolean(u.email_confirmed_at) }])
  );

  const unidadesPorOrganizacao = new Map<string, number>();
  for (const u of unidadesBrutas) {
    unidadesPorOrganizacao.set(u.organizacao_id, (unidadesPorOrganizacao.get(u.organizacao_id) ?? 0) + 1);
  }

  const organizacoes: OrganizacaoPainel[] = organizacoesBrutas.map((o) => ({
    id: o.id,
    nome: o.nome,
    tipoCliente: o.tipo_cliente,
    ativo: o.ativo,
    totalUnidades: unidadesPorOrganizacao.get(o.id) ?? 0,
  }));

  const unidades: UnidadePainel[] = unidadesBrutas.map((u) => ({
    id: u.id,
    organizacaoId: u.organizacao_id,
    organizacaoNome: orgNomePorId.get(u.organizacao_id) ?? u.organizacao_id,
    nome: u.nome,
    fonteDadosEstoque: u.fonte_dados_estoque,
    spreadsheetId: u.spreadsheet_id,
    consolidadoVendasHabilitado: u.consolidado_vendas_habilitado,
    ativo: u.ativo,
  }));

  const vinculos: VinculoPainel[] = vinculosBrutos.map((v) => {
    const usuario = usuarioPorId.get(v.user_id);
    return {
      id: v.id,
      userId: v.user_id,
      email: usuario?.email || "(email indisponível)",
      nome: perfilNomePorId.get(v.user_id) ?? null,
      organizacaoId: v.organizacao_id,
      organizacaoNome: orgNomePorId.get(v.organizacao_id) ?? v.organizacao_id,
      unidadeId: v.unidade_id,
      unidadeNome: v.unidade_id ? unidadeNomePorId.get(v.unidade_id) ?? v.unidade_id : null,
      role: v.role,
      status: v.status,
      confirmado: usuario?.confirmado ?? false,
      criadoEm: v.created_at,
    };
  });

  return { organizacoes, unidades, vinculos };
}
