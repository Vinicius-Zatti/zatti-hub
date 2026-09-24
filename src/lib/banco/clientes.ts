import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { montarResumoWhatsapp } from "@/lib/clientes/jornada";
import type {
  Acompanhamento,
  ClienteCompleto,
  DimensaoDiagnostico,
  EtapaJornada,
  Indicador,
  ItemCliente,
  ItemOnboarding,
  LinkCliente,
  Reuniao,
} from "@/lib/clientes/tipos";
import type { z } from "zod";
import type {
  diagnosticoClienteSchema,
  etapaClienteSchema,
  fecharReuniaoSchema,
  indicadorClienteSchema,
  itemClienteSchema,
  linkClienteSchema,
  onboardingClienteSchema,
  visaoGeralClienteSchema,
} from "@/lib/validacao";

/** Acesso ao banco da Gestão de Clientes. O RLS (`usuario_e_master()`) é a
 * barreira real; aqui toda escrita em tabela filha ainda filtra por
 * `acompanhamento_id`, para um id de outro cliente não alterar nada. */

type Linha = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const sn = (v: unknown) => (typeof v === "string" ? v : null);

function falhou(error: unknown, contexto: string): never {
  console.error(`clientes: ${contexto}`, error);
  throw new Error(contexto);
}

const mapAcompanhamento = (r: Linha, nome: string): Acompanhamento => ({
  id: s(r.id),
  organizacaoId: s(r.organizacao_id),
  organizacaoNome: nome,
  objetivoContratado: s(r.objetivo_contratado),
  metaPrincipal: s(r.meta_principal),
  etapaAtual: r.etapa_atual as Acompanhamento["etapaAtual"],
  saude: r.saude as Acompanhamento["saude"],
  pessoas: Array.isArray(r.pessoas) ? (r.pessoas as Acompanhamento["pessoas"]) : [],
  prioridades: Array.isArray(r.prioridades) ? (r.prioridades as string[]) : [],
  proximoMarco: s(r.proximo_marco),
  proximoMarcoData: sn(r.proximo_marco_data),
  termoCalendario: s(r.termo_calendario),
  cadenciaReunioes: s(r.cadencia_reunioes),
  atualizadoEm: s(r.atualizado_em),
});

const mapEtapa = (r: Linha): EtapaJornada => ({
  id: s(r.id),
  etapa: r.etapa as EtapaJornada["etapa"],
  ordem: Number(r.ordem),
  responsavel: r.responsavel as EtapaJornada["responsavel"],
  prazo: sn(r.prazo),
  situacao: r.situacao as EtapaJornada["situacao"],
  evidencia: s(r.evidencia),
  pendencia: s(r.pendencia),
  criterioConclusao: s(r.criterio_conclusao),
  checklist: Array.isArray(r.checklist) ? (r.checklist as EtapaJornada["checklist"]) : [],
});

const mapOnboarding = (r: Linha): ItemOnboarding => ({
  id: s(r.id),
  bloco: r.bloco as ItemOnboarding["bloco"],
  item: s(r.item),
  resposta: s(r.resposta),
  situacao: r.situacao as ItemOnboarding["situacao"],
  ordem: Number(r.ordem),
});

const mapReuniao = (r: Linha): Reuniao => ({
  id: s(r.id),
  data: s(r.data),
  titulo: s(r.titulo),
  situacao: r.situacao as Reuniao["situacao"],
  resumo: s(r.resumo),
  resumoWhatsapp: s(r.resumo_whatsapp),
  pautaProxima: s(r.pauta_proxima),
});

const mapItem = (r: Linha): ItemCliente => ({
  id: s(r.id),
  reuniaoId: sn(r.reuniao_id),
  tipo: r.tipo as ItemCliente["tipo"],
  texto: s(r.texto),
  responsavel: (sn(r.responsavel) as ItemCliente["responsavel"]) ?? null,
  prazo: sn(r.prazo),
  situacao: r.situacao as ItemCliente["situacao"],
  criadoEm: s(r.criado_em),
});

const mapDiagnostico = (r: Linha): DimensaoDiagnostico => ({
  id: s(r.id),
  dimensao: r.dimensao as DimensaoDiagnostico["dimensao"],
  situacao: r.situacao as DimensaoDiagnostico["situacao"],
  resumo: s(r.resumo),
});

const mapIndicador = (r: Linha): Indicador => ({
  id: s(r.id), nome: s(r.nome), valor: s(r.valor), referencia: s(r.referencia), fonte: s(r.fonte),
});

const mapLink = (r: Linha): LinkCliente => ({
  id: s(r.id), tipo: r.tipo as LinkCliente["tipo"], titulo: s(r.titulo), url: s(r.url), observacao: s(r.observacao),
});

// ── Leitura ────────────────────────────────────────────────────────────────

export type OrganizacaoCarteira = { id: string; nome: string; tipoCliente: string };

/** Clientes que podem entrar na carteira: consultoria ou híbrido, ativos. */
export async function listarOrganizacoesDaCarteira(): Promise<OrganizacaoCarteira[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizacoes")
    .select("id, nome, tipo_cliente")
    .eq("ativo", true)
    .in("tipo_cliente", ["consultoria", "hybrid"])
    .order("nome");
  if (error) falhou(error, "listar organizações");
  return (data ?? []).map((o) => ({ id: o.id, nome: o.nome, tipoCliente: o.tipo_cliente }));
}

/** Carrega um ou vários clientes completos com uma consulta por tabela. */
export async function carregarClientes(filtro: { acompanhamentoId?: string } = {}): Promise<ClienteCompleto[]> {
  const supabase = await createClient();
  let consulta = supabase.from("zh_clientes_acompanhamentos").select("*, organizacoes(nome)");
  if (filtro.acompanhamentoId) consulta = consulta.eq("id", filtro.acompanhamentoId);
  const { data: acomps, error } = await consulta;
  if (error) falhou(error, "carregar acompanhamentos");
  if (!acomps?.length) return [];

  const ids = acomps.map((a) => a.id as string);
  const ler = async (tabela: string, ordem: string) => {
    const { data, error: e } = await supabase.from(tabela).select("*").in("acompanhamento_id", ids).order(ordem);
    if (e) falhou(e, `carregar ${tabela}`);
    return (data ?? []) as Linha[];
  };
  const [etapas, onboarding, reunioes, itens, diagnostico, indicadores, links] = await Promise.all([
    ler("zh_clientes_etapas", "ordem"),
    ler("zh_clientes_onboarding", "ordem"),
    ler("zh_clientes_reunioes", "data"),
    ler("zh_clientes_itens", "criado_em"),
    ler("zh_clientes_diagnostico", "dimensao"),
    ler("zh_clientes_indicadores", "nome"),
    ler("zh_clientes_links", "titulo"),
  ]);
  const de = (linhas: Linha[], id: string) => linhas.filter((l) => l.acompanhamento_id === id);

  return acomps.map((a) => {
    const nome = (a.organizacoes as { nome?: string } | null)?.nome ?? a.organizacao_id;
    const id = a.id as string;
    return {
      acompanhamento: mapAcompanhamento(a, nome),
      etapas: de(etapas, id).map(mapEtapa),
      onboarding: de(onboarding, id).map(mapOnboarding),
      reunioes: de(reunioes, id).map(mapReuniao),
      itens: de(itens, id).map(mapItem),
      diagnostico: de(diagnostico, id).map(mapDiagnostico),
      indicadores: de(indicadores, id).map(mapIndicador),
      links: de(links, id).map(mapLink),
    };
  });
}

export async function carregarCliente(acompanhamentoId: string): Promise<ClienteCompleto | null> {
  const [cliente] = await carregarClientes({ acompanhamentoId });
  return cliente ?? null;
}

async function exigirCliente(acompanhamentoId: string): Promise<ClienteCompleto> {
  const cliente = await carregarCliente(acompanhamentoId);
  if (!cliente) throw new ErroPublico("Cliente não encontrado.");
  return cliente;
}

// ── Escrita ────────────────────────────────────────────────────────────────

export async function iniciarAcompanhamento(organizacaoId: string): Promise<string> {
  const supabase = await createClient();
  // A organização vem da tela, então é conferida no banco (ativa, consultoria
  // ou híbrido). O gatilho da tabela repete a regra como última barreira.
  const { data: org } = await supabase
    .from("organizacoes")
    .select("id")
    .eq("id", organizacaoId)
    .eq("ativo", true)
    .in("tipo_cliente", ["consultoria", "hybrid"])
    .maybeSingle();
  if (!org) throw new ErroPublico("Cliente não encontrado na carteira.");

  const { data, error } = await supabase.rpc("iniciar_acompanhamento_cliente", { p_organizacao_id: organizacaoId });
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Esse cliente já tem acompanhamento.");
    falhou(error, "iniciar acompanhamento");
  }
  return data as string;
}

export async function salvarVisaoGeral(e: z.infer<typeof visaoGeralClienteSchema>) {
  const antes = (await exigirCliente(e.acompanhamentoId)).acompanhamento;
  const supabase = await createClient();
  const { error } = await supabase
    .from("zh_clientes_acompanhamentos")
    .update({
      objetivo_contratado: e.objetivoContratado,
      meta_principal: e.metaPrincipal,
      saude: e.saude,
      prioridades: e.prioridades,
      proximo_marco: e.proximoMarco,
      proximo_marco_data: e.proximoMarcoData,
      pessoas: e.pessoas,
      termo_calendario: e.termoCalendario,
      cadencia_reunioes: e.cadenciaReunioes,
    })
    .eq("id", e.acompanhamentoId);
  if (error) falhou(error, "salvar visão geral");
  return { antes };
}

export async function salvarEtapa(e: z.infer<typeof etapaClienteSchema>) {
  const cliente = await exigirCliente(e.acompanhamentoId);
  const antes = cliente.etapas.find((x) => x.etapa === e.etapa) ?? null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("zh_clientes_etapas")
    .update({
      responsavel: e.responsavel,
      prazo: e.prazo,
      situacao: e.situacao,
      evidencia: e.evidencia,
      pendencia: e.pendencia,
      criterio_conclusao: e.criterioConclusao,
      checklist: e.checklist,
    })
    .eq("acompanhamento_id", e.acompanhamentoId)
    .eq("etapa", e.etapa);
  if (error) falhou(error, "salvar etapa");
  if (e.tornarAtual && cliente.acompanhamento.etapaAtual !== e.etapa) {
    const { error: e2 } = await supabase
      .from("zh_clientes_acompanhamentos")
      .update({ etapa_atual: e.etapa })
      .eq("id", e.acompanhamentoId);
    if (e2) falhou(e2, "trocar etapa atual");
  }
  return { antes, etapaAtualAntes: cliente.acompanhamento.etapaAtual };
}

/** Insere ou atualiza uma linha de tabela filha, sempre presa ao cliente. */
async function gravarFilho(tabela: string, acompanhamentoId: string, id: string | null, valores: Linha) {
  const supabase = await createClient();
  if (id) {
    const { data: antes } = await supabase.from(tabela).select("*").eq("id", id).eq("acompanhamento_id", acompanhamentoId).maybeSingle();
    if (!antes) throw new ErroPublico("Registro não encontrado.");
    const { error } = await supabase.from(tabela).update(valores).eq("id", id).eq("acompanhamento_id", acompanhamentoId);
    if (error) falhou(error, `atualizar ${tabela}`);
    return { id, antes };
  }
  await exigirCliente(acompanhamentoId);
  const { data, error } = await supabase
    .from(tabela)
    .insert({ ...valores, acompanhamento_id: acompanhamentoId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Já existe um registro igual.");
    falhou(error, `inserir em ${tabela}`);
  }
  return { id: data.id as string, antes: null };
}

async function excluirFilho(tabela: string, acompanhamentoId: string, id: string) {
  const supabase = await createClient();
  const { data: antes } = await supabase.from(tabela).select("*").eq("id", id).eq("acompanhamento_id", acompanhamentoId).maybeSingle();
  if (!antes) throw new ErroPublico("Registro não encontrado.");
  const { error } = await supabase.from(tabela).delete().eq("id", id).eq("acompanhamento_id", acompanhamentoId);
  if (error) falhou(error, `excluir de ${tabela}`);
  return { antes };
}

export const salvarOnboarding = (e: z.infer<typeof onboardingClienteSchema>) =>
  gravarFilho("zh_clientes_onboarding", e.acompanhamentoId, e.id, {
    bloco: e.bloco, item: e.item, resposta: e.resposta, situacao: e.situacao,
  });

export async function salvarItem(e: z.infer<typeof itemClienteSchema>) {
  if (e.reuniaoId) {
    const cliente = await exigirCliente(e.acompanhamentoId);
    const reuniao = cliente.reunioes.find((r) => r.id === e.reuniaoId);
    if (!reuniao) throw new ErroPublico("Reunião não encontrada.");
    if (reuniao.situacao !== "aberta" && !e.id) throw new ErroPublico("Essa reunião já foi fechada.");
  }
  return gravarFilho("zh_clientes_itens", e.acompanhamentoId, e.id, {
    reuniao_id: e.reuniaoId,
    tipo: e.tipo,
    texto: e.texto,
    responsavel: e.responsavel,
    prazo: e.prazo,
    situacao: e.situacao,
  });
}

export async function abrirReuniao(acompanhamentoId: string, data: string, titulo: string) {
  const r = await gravarFilho("zh_clientes_reunioes", acompanhamentoId, null, { data, titulo, situacao: "aberta" }).catch((err) => {
    if (err instanceof ErroPublico && err.message.startsWith("Já existe")) {
      throw new ErroPublico("Já existe uma reunião aberta para esse cliente. Feche-a antes de abrir outra.");
    }
    throw err;
  });
  return r;
}

export async function fecharReuniao(e: z.infer<typeof fecharReuniaoSchema>) {
  const cliente = await exigirCliente(e.acompanhamentoId);
  const reuniao = cliente.reunioes.find((r) => r.id === e.reuniaoId);
  if (!reuniao) throw new ErroPublico("Reunião não encontrada.");
  if (reuniao.situacao !== "aberta") throw new ErroPublico("Essa reunião já foi fechada.");

  const itensDaReuniao = cliente.itens.filter((i) => i.reuniaoId === reuniao.id && i.situacao !== "cancelada");
  const primeiroContato = !cliente.reunioes.some((r) => r.resumoWhatsapp.trim() !== "");
  const resumoWhatsapp = montarResumoWhatsapp({
    reuniao: { ...reuniao, resumo: e.resumo },
    itens: itensDaReuniao,
    pautaProxima: e.pautaProxima,
    primeiroContato,
  });

  // Reunião, checklist da etapa atual e acompanhamento numa transação só
  // (`fechar_reuniao_cliente`): ou as três gravações ficam, ou nenhuma fica.
  const supabase = await createClient();
  const { error } = await supabase.rpc("fechar_reuniao_cliente", {
    p_acompanhamento_id: e.acompanhamentoId,
    p_reuniao_id: reuniao.id,
    p_resumo: e.resumo,
    p_pauta_proxima: e.pautaProxima,
    p_resumo_whatsapp: resumoWhatsapp,
    p_checklist_feitos: e.checklistFeitos,
  });
  if (error) {
    if (error.code === "22023") throw new ErroPublico("Item do checklist inválido. Recarregue a página.");
    if (error.code === "23514") throw new ErroPublico("Essa reunião já foi fechada.");
    falhou(error, "fechar reunião");
  }
  return { antes: reuniao, resumoWhatsapp };
}

export async function salvarDiagnostico(e: z.infer<typeof diagnosticoClienteSchema>) {
  const cliente = await exigirCliente(e.acompanhamentoId);
  const antes = cliente.diagnostico.find((d) => d.dimensao === e.dimensao) ?? null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("zh_clientes_diagnostico")
    .update({ situacao: e.situacao, resumo: e.resumo })
    .eq("acompanhamento_id", e.acompanhamentoId)
    .eq("dimensao", e.dimensao);
  if (error) falhou(error, "salvar diagnóstico");
  return { antes };
}

export const salvarIndicador = (e: z.infer<typeof indicadorClienteSchema>) =>
  gravarFilho("zh_clientes_indicadores", e.acompanhamentoId, e.id, {
    nome: e.nome, valor: e.valor, referencia: e.referencia, fonte: e.fonte,
  });

export const excluirIndicador = (acompanhamentoId: string, id: string) =>
  excluirFilho("zh_clientes_indicadores", acompanhamentoId, id);

export const salvarLink = (e: z.infer<typeof linkClienteSchema>) =>
  gravarFilho("zh_clientes_links", e.acompanhamentoId, e.id, {
    tipo: e.tipo, titulo: e.titulo, url: e.url, observacao: e.observacao,
  });

export const excluirLink = (acompanhamentoId: string, id: string) =>
  excluirFilho("zh_clientes_links", acompanhamentoId, id);
