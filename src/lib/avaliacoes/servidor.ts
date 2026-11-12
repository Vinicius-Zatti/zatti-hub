import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AcessoAtual } from "@/lib/acesso";
import { lerPerguntas, type PerguntaConfig } from "./perguntas";
import type { RespostaPainel } from "./painel";

// Leituras do módulo Avaliações no servidor. A gestão lê pela própria sessão (RLS de
// `usuario_pode_usar_avaliacoes`); o client admin só entra depois da barreira da tela
// (requireAvaliacoes) e sempre recortado pela unidade da sessão.

export const BUCKET_LOGOS = "avaliacoes-logos";

/** Módulo ligado na unidade. Leitura à parte (não entra no acesso de toda tela) e tolerante:
 * qualquer falha, inclusive a coluna ainda não existir, vale "desligado". */
export async function lerAvaliacoesHabilitado(unidadeId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("unidades").select("avaliacoes_habilitado").eq("id", unidadeId).maybeSingle();
    if (error) return false;
    return (data as { avaliacoes_habilitado?: boolean } | null)?.avaliacoes_habilitado === true;
  } catch {
    return false;
  }
}

export type PesquisaGestao = {
  id: string;
  slug: string;
  nomeExibido: string;
  corPrincipal: string;
  corFundo: string;
  logoPath: string | null;
  textoAgradecimento: string;
  linkGoogle: string | null;
  ativa: boolean;
  versaoAtual: number;
  alertaVinculoId: string | null;
  perguntas: PerguntaConfig[];
};

type LinhaPesquisa = {
  id: string;
  slug: string;
  nome_exibido: string;
  cor_principal: string;
  cor_fundo: string;
  logo_path: string | null;
  texto_agradecimento: string;
  link_google: string | null;
  ativa: boolean;
  versao_atual: number;
  alerta_vinculo_id: string | null;
};

/** Pesquisa da unidade da sessão (nulo = ainda não criada). Falha de leitura sobe para o
 * error.tsx do segmento, como nas outras telas. */
export async function carregarPesquisa(acesso: AcessoAtual): Promise<PesquisaGestao | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("avaliacoes_pesquisas")
    .select("id, slug, nome_exibido, cor_principal, cor_fundo, logo_path, texto_agradecimento, link_google, ativa, versao_atual, alerta_vinculo_id")
    .eq("unidade_id", acesso.unidadeId)
    .maybeSingle();
  if (error) {
    console.error("Falha ao ler a pesquisa de avaliações", error.code ?? "", error.message);
    throw new Error("Não foi possível ler a pesquisa de avaliações.");
  }
  if (!data) return null;
  const p = data as LinhaPesquisa;
  const { data: versao, error: erroVersao } = await supabase
    .from("avaliacoes_pesquisa_versoes")
    .select("perguntas")
    .eq("pesquisa_id", p.id)
    .eq("versao", p.versao_atual)
    .maybeSingle();
  if (erroVersao) throw new Error("Não foi possível ler as perguntas da pesquisa.");
  return {
    id: p.id,
    slug: p.slug,
    nomeExibido: p.nome_exibido,
    corPrincipal: p.cor_principal,
    corFundo: p.cor_fundo,
    logoPath: p.logo_path,
    textoAgradecimento: p.texto_agradecimento,
    linkGoogle: p.link_google,
    ativa: p.ativa,
    versaoAtual: p.versao_atual,
    alertaVinculoId: p.alerta_vinculo_id,
    perguntas: lerPerguntas((versao as { perguntas?: unknown } | null)?.perguntas),
  };
}

/** Limite de leitura do painel: acima disso a tela avisa que o período tem mais. */
export const LIMITE_RESPOSTAS_PAINEL = 5000;

type LinhaResposta = {
  id: string;
  criado_em: string;
  origem: "salao" | "delivery";
  atendimento: number | null;
  comida: number | null;
  espera: string | null;
  nps: number | null;
  conheceu: string | null;
  conheceu_outro: string | null;
  comentario: string | null;
  nota_baixa: boolean;
  whatsapp: string | null;
  consentimento_em: string | null;
  consentimento_versao: number | null;
};

/** Respostas da unidade desde `desdeIso`, mais nova primeiro. Lista explícita de colunas: os
 * hashes nem estão liberados para a sessão. */
export async function carregarRespostas(acesso: AcessoAtual, desdeIso: string): Promise<{ respostas: RespostaPainel[]; cortado: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("avaliacoes_respostas")
    .select("id, criado_em, origem, atendimento, comida, espera, nps, conheceu, conheceu_outro, comentario, nota_baixa, whatsapp, consentimento_em, consentimento_versao")
    .eq("unidade_id", acesso.unidadeId)
    .gte("criado_em", desdeIso)
    .order("criado_em", { ascending: false })
    .limit(LIMITE_RESPOSTAS_PAINEL + 1);
  if (error) {
    console.error("Falha ao ler as avaliações", error.code ?? "", error.message);
    throw new Error("Não foi possível ler as avaliações.");
  }
  const linhas = (data ?? []) as LinhaResposta[];
  return {
    cortado: linhas.length > LIMITE_RESPOSTAS_PAINEL,
    respostas: linhas.slice(0, LIMITE_RESPOSTAS_PAINEL).map((r) => ({
      id: r.id,
      criadoEm: r.criado_em,
      origem: r.origem,
      atendimento: r.atendimento,
      comida: r.comida,
      espera: r.espera,
      nps: r.nps,
      conheceu: r.conheceu,
      conheceuOutro: r.conheceu_outro,
      comentario: r.comentario,
      notaBaixa: r.nota_baixa,
      whatsapp: r.whatsapp,
      consentimentoEm: r.consentimento_em,
      consentimentoVersao: r.consentimento_versao,
    })),
  };
}

export type SituacaoAlertas = { pendentes: number; enviados7d: number; incertosOuFalhos7d: number };

export async function carregarSituacaoAlertas(acesso: AcessoAtual): Promise<SituacaoAlertas> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("avaliacoes_alertas")
    .select("estado, gerado_em")
    .eq("unidade_id", acesso.unidadeId)
    .or(`estado.in.(pendente,reservado),gerado_em.gte.${desde}`)
    .limit(2000);
  const linhas = (data ?? []) as { estado: string; gerado_em: string }[];
  return {
    pendentes: linhas.filter((l) => l.estado === "pendente" || l.estado === "reservado").length,
    enviados7d: linhas.filter((l) => l.estado === "enviado" && l.gerado_em >= desde).length,
    incertosOuFalhos7d: linhas.filter((l) => (l.estado === "incerto" || l.estado === "falhou" || l.estado === "expirado") && l.gerado_em >= desde).length,
  };
}

// ── Quem pode receber o alerta ───────────────────────────────────────────

export type CandidatoAlerta = {
  vinculoId: string;
  nome: string;
  papel: "gestao" | "operacional";
  alcance: string;
  /** Só os 4 últimos dígitos vão ao navegador, como na Equipe. */
  whatsappFinal: string | null;
};

export type DestinatarioAtual = {
  vinculoId: string;
  nome: string;
  whatsappFinal: string | null;
  /** Nulo = válido; senão por que o alerta está parado. */
  motivo: "sem_acesso" | "sem_whatsapp" | null;
};

type VinculoBruto = { id: string; user_id: string; organizacao_id: string; unidade_id: string | null; role: string; status: string; whatsapp: string | null };

/** Pessoas da Equipe desta organização que alcançam a unidade (gestão e operação). Chamar só
 * depois de `requireAvaliacoes`; o banco confere a elegibilidade de novo ao gravar. */
export async function carregarDestinatarios(
  acesso: AcessoAtual,
  alertaVinculoId: string | null,
): Promise<{ atual: DestinatarioAtual | null; candidatos: CandidatoAlerta[] }> {
  const admin = createAdminClient();
  const [{ data: vinculosOrg }, { data: unidades }] = await Promise.all([
    admin
      .from("vinculos")
      .select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp")
      .eq("organizacao_id", acesso.organizacaoId)
      .in("role", ["gestao", "operacional"])
      .eq("status", "ativo"),
    admin.from("unidades").select("id, nome").eq("organizacao_id", acesso.organizacaoId),
  ]);
  const nomeUnidade = new Map(((unidades ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]));
  const elegiveis = ((vinculosOrg ?? []) as VinculoBruto[]).filter((v) => v.unidade_id === null || v.unidade_id === acesso.unidadeId);
  let vinculoAtual = alertaVinculoId ? elegiveis.find((v) => v.id === alertaVinculoId) ?? null : null;
  if (alertaVinculoId && !vinculoAtual) {
    const { data } = await admin.from("vinculos").select("id, user_id, organizacao_id, unidade_id, role, status, whatsapp").eq("id", alertaVinculoId).maybeSingle();
    vinculoAtual = (data as VinculoBruto | null) ?? null;
  }
  const ids = [...new Set([...elegiveis.map((v) => v.user_id), ...(vinculoAtual ? [vinculoAtual.user_id] : [])])];
  const { data: perfis } = ids.length ? await admin.from("perfis").select("id, nome").in("id", ids) : { data: [] };
  const nome = new Map(((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome]));
  const nomeDe = (v: VinculoBruto) => nome.get(v.user_id)?.trim() || "Sem nome";
  const final = (w: string | null) => (w ? w.replace(/\D/g, "").slice(-4) : null);

  const candidatos: CandidatoAlerta[] = elegiveis
    .map((v) => ({
      vinculoId: v.id,
      nome: nomeDe(v),
      papel: v.role === "gestao" ? ("gestao" as const) : ("operacional" as const),
      alcance: v.unidade_id === null ? "Toda a organização" : nomeUnidade.get(v.unidade_id) ?? "Esta unidade",
      whatsappFinal: final(v.whatsapp),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  let atual: DestinatarioAtual | null = null;
  if (vinculoAtual) {
    const alcanca =
      vinculoAtual.status === "ativo" &&
      (vinculoAtual.role === "master" ||
        ((vinculoAtual.role === "gestao" || vinculoAtual.role === "operacional") &&
          vinculoAtual.organizacao_id === acesso.organizacaoId &&
          (vinculoAtual.unidade_id === null || vinculoAtual.unidade_id === acesso.unidadeId)));
    atual = {
      vinculoId: vinculoAtual.id,
      nome: nomeDe(vinculoAtual),
      whatsappFinal: final(vinculoAtual.whatsapp),
      motivo: !alcanca ? "sem_acesso" : vinculoAtual.whatsapp ? null : "sem_whatsapp",
    };
  }
  return { atual, candidatos };
}

// ── Logo ─────────────────────────────────────────────────────────────────

/** URL pública da logo (bucket público só com as logos). */
export function urlPublicaLogo(logoPath: string | null): string | null {
  if (!logoPath) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/storage/v1/object/public/${BUCKET_LOGOS}/${logoPath}` : null;
}

/** Logo como data URL, para a arte do QR ser desenhada no navegador sem depender de outra origem
 * (o canvas não fica "sujo" e o PNG pode ser baixado). Nulo = sem logo ou falha. */
export async function logoComoDataUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const { data, error } = await createAdminClient().storage.from(BUCKET_LOGOS).download(logoPath);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    const tipo = logoPath.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// ── Página pública ───────────────────────────────────────────────────────

export type PesquisaPublica = {
  slug: string;
  nome: string;
  corPrincipal: string;
  corFundo: string;
  logoUrl: string | null;
  agradecimento: string;
  linkGoogle: string | null;
  ativa: boolean;
  perguntas: PerguntaConfig[];
  termoVersao: number;
  termoTexto: string;
};

/** Lida pelo servidor (service role) na página pública, sem sessão. Nulo = não existe ou o
 * módulo está desligado na unidade. */
export async function carregarPesquisaPublica(slug: string): Promise<PesquisaPublica | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const { data, error } = await createAdminClient().rpc("avaliacoes_pesquisa_publica", { p_slug: slug });
  if (error) {
    console.error("avaliacoes_pesquisa_publica_falhou", { codigo: error.code ?? null });
    throw new Error("Não foi possível abrir a pesquisa.");
  }
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    slug: String(d.slug),
    nome: String(d.nome),
    corPrincipal: String(d.corPrincipal),
    corFundo: String(d.corFundo),
    logoUrl: urlPublicaLogo(typeof d.logoPath === "string" ? d.logoPath : null),
    agradecimento: String(d.agradecimento),
    linkGoogle: typeof d.linkGoogle === "string" ? d.linkGoogle : null,
    ativa: d.ativa === true,
    perguntas: lerPerguntas(d.perguntas),
    termoVersao: Number(d.termoVersao),
    termoTexto: String(d.termoTexto),
  };
}
