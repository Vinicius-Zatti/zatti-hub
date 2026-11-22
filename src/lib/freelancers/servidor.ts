import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AcessoAtual } from "@/lib/acesso";
import { urlPublicaLogo } from "@/lib/avaliacoes/servidor";
import type { AvisoTitulo, Checkin, EstadoCheckin, Freelancer, SituacaoFreelancer } from "./regras";

// Leituras do módulo Freelancers no servidor. Quem usa o módulo lê pela própria sessão (RLS de
// `usuario_pode_usar_freelancers`); o client admin entra só para o que a sessão não alcança de
// propósito: nomes de quem conferiu, a página pública do QR e os títulos do Contas a Pagar
// (Financeiro exclusivo), sempre recortado pela unidade da sessão, depois da barreira da tela.

/** Módulo ligado na unidade. Tolerante: falha (inclusive a coluna ainda não existir) = desligado. */
export async function lerFreelancersHabilitado(unidadeId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("unidades").select("freelancers_habilitado").eq("id", unidadeId).maybeSingle();
    if (error) return false;
    return (data as { freelancers_habilitado?: boolean } | null)?.freelancers_habilitado === true;
  } catch {
    return false;
  }
}

export type ConfiguracaoFreela = {
  slug: string;
  diariaPadrao: number | null;
  contaCaixaId: string | null;
  ativa: boolean;
};

export async function carregarConfiguracao(acesso: AcessoAtual): Promise<ConfiguracaoFreela | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("freela_configuracoes")
    .select("slug, diaria_padrao, conta_caixa_id, ativa")
    .eq("unidade_id", acesso.unidadeId)
    .maybeSingle();
  if (error) {
    console.error("Falha ao ler a configuração dos freelancers", error.code ?? "", error.message);
    throw new Error("Não foi possível ler a configuração dos freelancers.");
  }
  if (!data) return null;
  const c = data as { slug: string; diaria_padrao: number | string | null; conta_caixa_id: string | null; ativa: boolean };
  return { slug: c.slug, diariaPadrao: c.diaria_padrao === null ? null : Number(c.diaria_padrao), contaCaixaId: c.conta_caixa_id, ativa: c.ativa };
}

type LinhaFreelancer = {
  id: string;
  nome: string;
  whatsapp: string;
  funcao: string | null;
  diaria: number | string | null;
  situacao: SituacaoFreelancer;
  criado_por: string | null;
};

function paraFreelancer(f: LinhaFreelancer): Freelancer {
  return {
    id: f.id,
    nome: f.nome,
    whatsapp: f.whatsapp,
    funcao: f.funcao,
    diaria: f.diaria === null ? null : Number(f.diaria),
    situacao: f.situacao,
    criadoPeloQr: f.criado_por === null,
  };
}

export async function listarFreelancers(acesso: AcessoAtual): Promise<Freelancer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("freelancers")
    .select("id, nome, whatsapp, funcao, diaria, situacao, criado_por")
    .eq("unidade_id", acesso.unidadeId)
    .order("nome")
    .limit(2000);
  if (error) throw new Error("Não foi possível ler os freelancers.");
  return ((data ?? []) as LinhaFreelancer[]).map(paraFreelancer);
}

type LinhaCheckin = {
  id: string;
  freelancer_id: string;
  dia: string;
  entrada_em: string;
  origem: "qr" | "manual";
  nome_digitado: string | null;
  aparelho_repetido: boolean;
  estado: EstadoCheckin;
  valor: number | string | null;
  pago_no_caixa: boolean;
  motivo_recusa: string | null;
  conferido_por: string | null;
  lancamento_id: string | null;
  titulo_gerado_em: string | null;
  titulo_a_remover: string | null;
  titulo_aviso: AvisoTitulo | null;
  freelancers: LinhaFreelancer | null;
};

export const LIMITE_CHECKINS = 3000;

/** Check-ins da unidade entre dois dias (inclusive), mais recente primeiro. Lista explícita de
 * colunas: os hashes nem estão liberados para a sessão. */
export async function listarCheckins(acesso: AcessoAtual, desde: string, ate: string): Promise<{ checkins: Checkin[]; cortado: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("freela_checkins")
    .select(
      "id, freelancer_id, dia, entrada_em, origem, nome_digitado, aparelho_repetido, estado, valor, pago_no_caixa, motivo_recusa, conferido_por, lancamento_id, titulo_gerado_em, titulo_a_remover, titulo_aviso, freelancers(id, nome, whatsapp, funcao, diaria, situacao, criado_por)",
    )
    .eq("unidade_id", acesso.unidadeId)
    .gte("dia", desde)
    .lte("dia", ate)
    .order("dia", { ascending: false })
    .order("entrada_em", { ascending: true })
    .limit(LIMITE_CHECKINS + 1);
  if (error) {
    console.error("Falha ao ler os check-ins", error.code ?? "", error.message);
    throw new Error("Não foi possível ler os check-ins.");
  }
  const linhas = (data ?? []) as unknown as LinhaCheckin[];
  const nomes = await nomesDeQuemConferiu(acesso, linhas.map((l) => l.conferido_por));
  return {
    cortado: linhas.length > LIMITE_CHECKINS,
    checkins: linhas.slice(0, LIMITE_CHECKINS).map((l) => ({
      id: l.id,
      freelancerId: l.freelancer_id,
      nome: l.freelancers?.nome ?? "Sem nome",
      funcao: l.freelancers?.funcao ?? null,
      situacaoFreelancer: l.freelancers?.situacao ?? "ativo",
      diariaCadastro: l.freelancers?.diaria == null ? null : Number(l.freelancers.diaria),
      whatsapp: l.freelancers?.whatsapp ?? "",
      dia: l.dia,
      entradaEm: l.entrada_em,
      origem: l.origem,
      nomeDigitado: l.nome_digitado,
      aparelhoRepetido: l.aparelho_repetido,
      estado: l.estado,
      valor: l.valor === null ? null : Number(l.valor),
      pagoNoCaixa: l.pago_no_caixa,
      motivoRecusa: l.motivo_recusa,
      conferidoPorNome: l.conferido_por ? nomes.get(l.conferido_por) ?? "Equipe" : null,
      lancamentoId: l.lancamento_id,
      tituloGeradoEm: l.titulo_gerado_em,
      tituloARemover: l.titulo_a_remover,
      tituloAviso: l.titulo_aviso,
    })),
  };
}

/** Nome de quem conferiu (perfis não é legível pela sessão de todo mundo). Só ids que já vieram
 * dos check-ins que a sessão leu. */
async function nomesDeQuemConferiu(acesso: AcessoAtual, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (unicos.length === 0) return new Map();
  if (acesso.usuarioNome && unicos.length === 1 && unicos[0] === acesso.userId) return new Map([[acesso.userId, acesso.usuarioNome]]);
  const { data } = await createAdminClient().from("perfis").select("id, nome").in("id", unicos);
  return new Map(((data ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome?.trim() || "Equipe"]));
}

/** Contas de caixa ativas (id e nome), para quem edita escolher a do pagamento. */
export async function listarContasCaixa(acesso: AcessoAtual): Promise<{ id: string; nome: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("freela_contas_caixa", { p_unidade_id: acesso.unidadeId });
  if (error) return [];
  return (data ?? []) as { id: string; nome: string }[];
}

/** Cria ou apaga os títulos no Contas a Pagar (service role; a função só age sobre o que a
 * conferência já decidiu). Falha não derruba a tela: a diária fica "conferida" e a próxima
 * chamada tenta de novo. */
export async function sincronizarTitulos(unidadeId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("freela_sincronizar_titulos", { p_unidade_id: unidadeId });
    if (error) console.error("freela_sincronizar_titulos_falhou", { codigo: error.code ?? null });
  } catch (e) {
    console.error("freela_sincronizar_titulos_falhou", e instanceof Error ? e.message : "erro");
  }
}

// ── Página pública ───────────────────────────────────────────────────────

export type PaginaPublica = {
  slug: string;
  ativa: boolean;
  nome: string;
  corPrincipal: string;
  corFundo: string;
  logoUrl: string | null;
};

/** Nome e marca do restaurante para a página do QR. Nulo = endereço inexistente. */
export async function carregarPaginaPublica(slug: string): Promise<PaginaPublica | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const { data, error } = await createAdminClient().rpc("freela_pagina_publica", { p_slug: slug });
  if (error) throw new Error("Não foi possível abrir o check-in.");
  if (!data) return null;
  const p = data as { slug: string; ativa: boolean; nome: string; corPrincipal: string; corFundo: string; logoPath: string | null };
  return { slug: p.slug, ativa: p.ativa === true, nome: p.nome, corPrincipal: p.corPrincipal, corFundo: p.corFundo, logoUrl: urlPublicaLogo(p.logoPath) };
}

/** Marca para a arte do QR (logo como data URL vem de `logoComoDataUrl` das Avaliações). */
export async function lerMarcaDaUnidade(unidadeId: string): Promise<{ nome: string | null; corPrincipal: string; corFundo: string; logoPath: string | null }> {
  const { data } = await createAdminClient()
    .from("avaliacoes_pesquisas")
    .select("nome_exibido, cor_principal, cor_fundo, logo_path")
    .eq("unidade_id", unidadeId)
    .maybeSingle();
  const p = data as { nome_exibido: string; cor_principal: string; cor_fundo: string; logo_path: string | null } | null;
  return { nome: p?.nome_exibido ?? null, corPrincipal: p?.cor_principal ?? "#1F4E79", corFundo: p?.cor_fundo ?? "#FFFFFF", logoPath: p?.logo_path ?? null };
}
