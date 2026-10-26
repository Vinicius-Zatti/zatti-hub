import "server-only";
import { requireMaster } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarResponsavelAvisos } from "@/lib/garante/avisos-servidor";
import type { CandidatoAvisos, ResponsavelAvisosAtual } from "@/lib/garante/avisos";

export type OrganizacaoPainel = {
  id: string;
  nome: string;
  tipoCliente: string;
  ativo: boolean;
  totalUnidades: number;
  /** Titular marcado pelo master (26/10/2026). `valido = false`: deixou de ser gestão ativa e,
   * até marcar de novo, vale a reserva (gestão de todas as unidades conta como dono). */
  titular: { vinculoId: string; nome: string; valido: boolean } | null;
  /** Quem pode ser titular: gestão ativa da organização, de quem não é master. */
  candidatosTitular: { vinculoId: string; nome: string; alcance: string }[];
};

export type UnidadePainel = {
  id: string;
  organizacaoId: string;
  organizacaoNome: string;
  nome: string;
  fonteDadosEstoque: string;
  spreadsheetId: string | null;
  consolidadoVendasHabilitado: boolean;
  /** Chave "Usar extrato do estoque" (decisão 7, 13/10/2026). Só master liga. */
  extratoEstoqueHabilitado: boolean;
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
  /** Só os 4 últimos dígitos do WhatsApp do vínculo (o número inteiro não vai ao navegador). */
  whatsappFinal: string | null;
  criadoEm: string;
  /** Este vínculo é o titular marcado da organização (selo "Titular"). */
  ehTitular: boolean;
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
      .select("id, organizacao_id, nome, fonte_dados_estoque, spreadsheet_id, consolidado_vendas_habilitado, extrato_estoque_habilitado, ativo")
      .order("nome"),
    admin.from("vinculos").select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp, created_at").order("created_at", { ascending: false }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  // Tabela do titular (20261026120000): ainda não criada = ninguém marcado.
  const titularesResp = await admin.from("titulares_organizacao").select("organizacao_id, vinculo_id");
  if (titularesResp.error && titularesResp.error.code !== "42P01" && titularesResp.error.code !== "PGRST205") {
    throw new Error(titularesResp.error.message);
  }
  const titularPorOrg = new Map(
    ((titularesResp.data ?? []) as { organizacao_id: string; vinculo_id: string }[]).map((t) => [t.organizacao_id, t.vinculo_id]),
  );

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

  const masters = new Set(vinculosBrutos.filter((v) => v.role === "master" && v.status === "ativo").map((v) => v.user_id));
  const nomeDoVinculo = (v: { user_id: string }) =>
    perfilNomePorId.get(v.user_id) || usuarioPorId.get(v.user_id)?.email || "(sem nome)";
  const organizacoes: OrganizacaoPainel[] = organizacoesBrutas.map((o) => {
    const titularId = titularPorOrg.get(o.id) ?? null;
    const vinculoTitular = titularId ? vinculosBrutos.find((v) => v.id === titularId) : undefined;
    return {
      id: o.id,
      nome: o.nome,
      tipoCliente: o.tipo_cliente,
      ativo: o.ativo,
      totalUnidades: unidadesPorOrganizacao.get(o.id) ?? 0,
      titular: titularId
        ? {
            vinculoId: titularId,
            nome: vinculoTitular ? nomeDoVinculo(vinculoTitular) : "(acesso não encontrado)",
            valido: Boolean(
              vinculoTitular && vinculoTitular.role === "gestao" && vinculoTitular.status === "ativo" &&
                vinculoTitular.organizacao_id === o.id,
            ),
          }
        : null,
      candidatosTitular: vinculosBrutos
        .filter((v) => v.organizacao_id === o.id && v.role === "gestao" && v.status === "ativo" && !masters.has(v.user_id))
        .map((v) => ({
          vinculoId: v.id,
          nome: nomeDoVinculo(v),
          alcance: v.unidade_id ? unidadeNomePorId.get(v.unidade_id) ?? v.unidade_id : "Todas as unidades",
        })),
    };
  });

  const unidades: UnidadePainel[] = unidadesBrutas.map((u) => ({
    id: u.id,
    organizacaoId: u.organizacao_id,
    organizacaoNome: orgNomePorId.get(u.organizacao_id) ?? u.organizacao_id,
    nome: u.nome,
    fonteDadosEstoque: u.fonte_dados_estoque,
    spreadsheetId: u.spreadsheet_id,
    consolidadoVendasHabilitado: u.consolidado_vendas_habilitado,
    extratoEstoqueHabilitado: Boolean(u.extrato_estoque_habilitado),
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
      whatsappFinal: v.whatsapp ? String(v.whatsapp).slice(-4) : null,
      criadoEm: v.created_at,
      ehTitular: titularPorOrg.get(v.organizacao_id) === v.id,
    };
  });

  return { organizacoes, unidades, vinculos };
}

export type AvisosGaranteUnidade = {
  unidadeId: string;
  unidadeNome: string;
  organizacaoNome: string;
  atual: ResponsavelAvisosAtual | null;
  candidatos: CandidatoAvisos[];
};

/** Quem acompanha o Garante (recebe os avisos pelo Vini) em cada unidade ativa com o módulo
 * ligado. Candidatos: gestão da organização que alcança a unidade e masters, sempre com o
 * WhatsApp só pelos 4 últimos dígitos. Barreira real: `requireMaster()` de novo aqui. */
export async function carregarAvisosGaranteAcessos(): Promise<AvisosGaranteUnidade[]> {
  await requireMaster();
  const admin = createAdminClient();
  const [{ data: unidades, error: erroUnidades }, { data: orgs, error: erroOrgs }] = await Promise.all([
    admin.from("unidades").select("id, organizacao_id, nome, ativo, garante_habilitado").order("nome"),
    admin.from("organizacoes").select("id, nome"),
  ]);
  if (erroUnidades || erroOrgs) throw new Error("Não foi possível carregar os responsáveis pelos avisos do Garante.");
  const todas = (unidades ?? []) as { id: string; organizacao_id: string; nome: string; ativo: boolean; garante_habilitado: boolean }[];
  const nomeUnidade = new Map(todas.map((u) => [u.id, u.nome]));
  const nomeOrg = new Map(((orgs ?? []) as { id: string; nome: string }[]).map((o) => [o.id, o.nome]));
  return Promise.all(
    todas
      .filter((u) => u.ativo && u.garante_habilitado)
      .map(async (u) => {
        const { atual, candidatos } = await carregarResponsavelAvisos({
          unidadeId: u.id,
          organizacaoId: u.organizacao_id,
          incluirMaster: true,
          nomeUnidade: (id) => (id ? nomeUnidade.get(id) ?? id : "Toda a organização"),
        });
        return { unidadeId: u.id, unidadeNome: u.nome, organizacaoNome: nomeOrg.get(u.organizacao_id) ?? u.organizacao_id, atual, candidatos };
      }),
  );
}
