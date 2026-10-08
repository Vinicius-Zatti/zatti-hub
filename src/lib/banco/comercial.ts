import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import type { Etapa, EventoLead, Lead, Origem, TipoEvento, VendeDelivery } from "@/lib/comercial/funil";

/** Acesso ao banco do Comercial (CRM de leads). O RLS (`usuario_e_master()`)
 * é a barreira real; toda escrita passa pela RPC `zh_leads_atualizar`, que
 * grava a mudança e o evento da linha do tempo juntos. */

type Linha = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const sn = (v: unknown) => (typeof v === "string" ? v : null);
const nn = (v: unknown) => (v == null || v === "" ? null : Number(v));

function falhou(error: unknown, contexto: string): never {
  console.error(`comercial: ${contexto}`, error);
  throw new Error(contexto);
}

const mapLead = (r: Linha): Lead => ({
  id: s(r.id),
  whatsapp: s(r.whatsapp),
  instagram: s(r.instagram),
  cidadeBairro: s(r.cidade_bairro),
  seguidores: nn(r.seguidores),
  ultimoPostEm: sn(r.ultimo_post_em),
  notaGoogle: nn(r.nota_google),
  avaliacoesGoogle: nn(r.avaliacoes_google),
  vendeDelivery: (s(r.vende_delivery) as VendeDelivery) || "",
  nome: s(r.nome),
  negocio: s(r.negocio),
  origem: r.origem as Origem,
  produtoInteresse: s(r.produto_interesse),
  etapa: r.etapa as Etapa,
  motivoPerda: s(r.motivo_perda),
  faturamentoAtual: s(r.faturamento_atual),
  faturamentoDesejado: s(r.faturamento_desejado),
  dificuldade: s(r.dificuldade),
  proximaAcao: s(r.proxima_acao),
  proximaAcaoEm: sn(r.proxima_acao_em),
  organizacaoId: sn(r.organizacao_id),
  criadoEm: s(r.criado_em),
  etapaDesde: s(r.etapa_desde),
  ultimoEventoEm: s(r.ultimo_evento_em),
});

const mapEvento = (r: Linha): EventoLead => ({
  id: s(r.id),
  em: s(r.em),
  tipo: r.tipo as TipoEvento,
  deEtapa: (sn(r.de_etapa) as Etapa | null) ?? null,
  paraEtapa: (sn(r.para_etapa) as Etapa | null) ?? null,
  produto: s(r.produto),
  valor: r.valor == null ? null : Number(r.valor),
  texto: s(r.texto),
  autor: r.autor as EventoLead["autor"],
});

/** Até 1000 leads (teto de leitura do app); o funil é recente e pequeno. */
export async function carregarLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("zh_leads").select("*").order("ultimo_evento_em", { ascending: false }).limit(1000);
  if (error) falhou(error, "carregar leads");
  return (data ?? []).map(mapLead);
}

export async function carregarLead(id: string): Promise<{ lead: Lead; eventos: EventoLead[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("zh_leads").select("*").eq("id", id).maybeSingle();
  if (error) falhou(error, "carregar lead");
  if (!data) return null;
  const { data: eventos, error: e } = await supabase
    .from("zh_leads_eventos")
    .select("id, em, tipo, de_etapa, para_etapa, produto, valor, texto, autor")
    .eq("lead_id", id)
    .order("em", { ascending: true })
    .limit(1000);
  if (e) falhou(e, "carregar linha do tempo");
  return { lead: mapLead(data), eventos: (eventos ?? []).map(mapEvento) };
}

export type OrganizacaoOpcao = { id: string; nome: string };

/** Clientes já cadastrados no Painel de Acessos, para o "Virou cliente". */
export async function listarOrganizacoesAtivas(): Promise<OrganizacaoOpcao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizacoes").select("id, nome").eq("ativo", true).order("nome");
  if (error) falhou(error, "listar organizações");
  return (data ?? []).map((o) => ({ id: o.id as string, nome: o.nome as string }));
}

export async function atualizarLead(leadId: string, acao: string, dados: Record<string, unknown>): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("zh_leads_atualizar", { p_lead_id: leadId, p_acao: acao, p_dados: dados });
  if (error) {
    if (error.code === "P0002") throw new ErroPublico("Lead não encontrado.");
    if (error.code === "22023") throw new ErroPublico(error.message.includes("Motivo") ? "Informe o motivo da perda." : "Dados inválidos.");
    falhou(error, "atualizar lead");
  }
  return data as string;
}

export type NovoLeadBanco = {
  nome: string;
  negocio: string;
  instagram: string;
  whatsapp: string;
  origem: Origem;
  cidade_bairro: string;
  seguidores: number | null;
  ultimo_post_em: string | null;
  nota_google: number | null;
  avaliacoes_google: number | null;
  vende_delivery: VendeDelivery;
};

/** Cadastro manual (Novo lead). A RPC `zh_leads_criar` confere master,
 * normaliza WhatsApp e @, exige um dos dois e grava o evento `criado`. */
export async function criarLead(dados: NovoLeadBanco): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("zh_leads_criar", {
    p_dados: { ...dados, etapa: "comecar_a_seguir" },
  });
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Já existe um lead com esse Instagram ou WhatsApp.");
    if (error.code === "22023") {
      const m = error.message;
      if (m.includes("Informe")) throw new ErroPublico("Informe o Instagram ou o WhatsApp.");
      if (m.includes("Instagram")) throw new ErroPublico("Instagram inválido. Use só o @ do perfil.");
      if (m.includes("WhatsApp")) throw new ErroPublico("WhatsApp inválido. Use DDD + número.");
      throw new ErroPublico("Dados inválidos.");
    }
    falhou(error, "criar lead");
  }
  return data as string;
}
