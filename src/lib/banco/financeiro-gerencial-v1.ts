import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { erroDeNegocio, nomesPorUserId } from "@/lib/banco/financeiro-gerencial";
import type {
  BaixaBase,
  FechamentoMensal,
  LancamentoBase,
  OrigemLancamento,
  ParametrosProvisao,
  ParametrosProvisaoRegistro,
  RecorrenciaResumo,
  RegistroAuditoria,
  ReversaoProvisao,
  StatusParcela,
  TipoBaixa,
  TipoLancamento,
  TipoProvisao,
} from "@/lib/financeiro-gerencial/tipos";

// Financeiro Gerencial V1 completa (22/09) - Fluxo de Caixa, DFC, Provisões,
// Fechamento, Recorrências e auditoria. Separado de `financeiro-gerencial.ts`
// (já com ~1100 linhas); mesmas regras: unidade sempre vinda de
// `getAcessoAtual()`, RLS + gatilhos como barreira real.

type RespostaConsulta = { data: unknown; error: { message: string } | null };

/** Lê tudo, 1000 linhas por vez - o PostgREST corta em 1000 sem avisar, e
 * DRE/Provisões/Caixa precisam do histórico inteiro da unidade. */
async function buscarTudo<T>(montar: (de: number, ate: number) => PromiseLike<RespostaConsulta>): Promise<T[]> {
  const tamanho = 1000;
  const todas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montar(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    const linhas = (data as T[] | null) ?? [];
    todas.push(...linhas);
    if (linhas.length < tamanho) return todas;
  }
}

// ── Carga completa da unidade ───────────────────────────────────────────────

type LancamentoBaseRow = {
  id: string;
  tipo: TipoLancamento;
  categoria_id: string;
  descricao: string;
  data_competencia: string;
  origem: OrigemLancamento;
  recorrencia_id: string | null;
};
type ParcelaBaseRow = {
  id: string;
  lancamento_id: string;
  numero: number;
  total_parcelas: number;
  valor: number;
  data_prevista: string;
  conta_financeira_id: string | null;
  status: StatusParcela;
};
type BaixaBaseRow = { id: string; parcela_id: string; tipo: TipoBaixa; conta_financeira_id: string; valor: number; data: string };

export async function carregarBaseFinanceira(unidadeId: string): Promise<{ lancamentos: LancamentoBase[]; baixas: BaixaBase[] }> {
  const supabase = await createClient();
  const [lancamentosRows, parcelasRows, baixasRows] = await Promise.all([
    buscarTudo<LancamentoBaseRow>((de, ate) =>
      supabase
        .from("fin_lancamentos")
        .select("id, tipo, categoria_id, descricao, data_competencia, origem, recorrencia_id")
        .eq("unidade_id", unidadeId)
        .order("id")
        .range(de, ate),
    ),
    buscarTudo<ParcelaBaseRow>((de, ate) =>
      supabase
        .from("fin_parcelas")
        .select("id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id, status")
        .eq("unidade_id", unidadeId)
        .order("id")
        .range(de, ate),
    ),
    buscarTudo<BaixaBaseRow>((de, ate) =>
      supabase
        .from("fin_baixas")
        .select("id, parcela_id, tipo, conta_financeira_id, valor, data")
        .eq("unidade_id", unidadeId)
        .order("id")
        .range(de, ate),
    ),
  ]);

  const parcelasPorLancamento = new Map<string, LancamentoBase["parcelas"]>();
  for (const p of parcelasRows) {
    const lista = parcelasPorLancamento.get(p.lancamento_id) ?? [];
    lista.push({
      id: p.id,
      numero: p.numero,
      totalParcelas: p.total_parcelas,
      valor: Number(p.valor),
      dataPrevista: p.data_prevista,
      contaFinanceiraId: p.conta_financeira_id,
      status: p.status,
    });
    parcelasPorLancamento.set(p.lancamento_id, lista);
  }

  const lancamentos: LancamentoBase[] = lancamentosRows.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    categoriaId: l.categoria_id,
    descricao: l.descricao,
    dataCompetencia: l.data_competencia,
    origem: l.origem,
    recorrenciaId: l.recorrencia_id,
    parcelas: (parcelasPorLancamento.get(l.id) ?? []).sort((a, b) => a.numero - b.numero),
  }));

  const baixas: BaixaBase[] = baixasRows.map((b) => ({
    id: b.id,
    parcelaId: b.parcela_id,
    tipo: b.tipo,
    contaFinanceiraId: b.conta_financeira_id,
    valor: Number(b.valor),
    data: b.data,
  }));

  return { lancamentos, baixas };
}

// ── Recorrências ────────────────────────────────────────────────────────────

type RecorrenciaRow = {
  id: string;
  tipo: TipoLancamento;
  categoria_id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
  quantidade_ocorrencias: number | null;
  ativa: boolean;
  criado_em: string;
  fin_categorias: { nome: string } | null;
};

export async function listarRecorrenciasResumo(unidadeId: string, lancamentos: LancamentoBase[], baixas: BaixaBase[]): Promise<RecorrenciaResumo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_recorrencias")
    .select("id, tipo, categoria_id, descricao, valor, dia_vencimento, data_inicio, data_fim, quantidade_ocorrencias, ativa, criado_em, fin_categorias(nome)")
    .eq("unidade_id", unidadeId)
    .order("criado_em", { ascending: false });
  const linhas = (data as unknown as RecorrenciaRow[] | null) ?? [];

  const parcelasComBaixa = new Set(baixas.map((b) => b.parcelaId));
  return linhas.map((r) => {
    const ocorrencias = lancamentos.filter((l) => l.recorrenciaId === r.id);
    const emAberto = ocorrencias.filter((l) => l.parcelas.some((p) => p.status !== "cancelado" && p.status !== "quitado" && !parcelasComBaixa.has(p.id)));
    return {
      id: r.id,
      tipo: r.tipo,
      categoriaId: r.categoria_id,
      categoriaNome: r.fin_categorias?.nome ?? "",
      descricao: r.descricao,
      valor: Number(r.valor),
      diaVencimento: r.dia_vencimento,
      dataInicio: r.data_inicio,
      dataFim: r.data_fim,
      quantidadeOcorrencias: r.quantidade_ocorrencias,
      ativa: r.ativa,
      criadoEm: r.criado_em,
      ocorrencias: ocorrencias.length,
      ocorrenciasEmAberto: emAberto.length,
    };
  });
}

/** Encerra a recorrência: `ativa = false` e exclui as ocorrências futuras
 * (data prevista a partir de `aPartirDe`) que ainda não têm baixa nenhuma.
 * Ocorrência com baixa, ou antes da data, fica - histórico nunca some.
 * Gestão/master (RLS de update/delete + gatilho que impede excluir
 * lançamento com baixa). */
export async function encerrarRecorrencia(params: { unidadeId: string; id: string; aPartirDe: string }): Promise<{ excluidas: number }> {
  const supabase = await createClient();
  const { data: atualizada, error } = await supabase
    .from("fin_recorrencias")
    .update({ ativa: false })
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.id)
    .select("id");
  if (error) throw erroDeNegocio(error);
  if (!atualizada || atualizada.length === 0) throw new ErroPublico("Recorrência não encontrada.");

  const { data: ocorrencias } = await supabase
    .from("fin_lancamentos")
    .select("id")
    .eq("unidade_id", params.unidadeId)
    .eq("recorrencia_id", params.id);
  const ids = ((ocorrencias as { id: string }[] | null) ?? []).map((o) => o.id);
  if (ids.length === 0) return { excluidas: 0 };

  // Recorrência pode ter até 360 ocorrências - `.in()` em lotes pra não
  // estourar o tamanho da URL do PostgREST.
  type ParcelaOcorrencia = { id: string; lancamento_id: string; data_prevista: string; status: StatusParcela };
  const parcelasRows: ParcelaOcorrencia[] = [];
  for (const lote of emLotes(ids)) {
    const { data, error: erroParcelas } = await supabase
      .from("fin_parcelas")
      .select("id, lancamento_id, data_prevista, status")
      .eq("unidade_id", params.unidadeId)
      .in("lancamento_id", lote);
    if (erroParcelas) throw new Error(erroParcelas.message);
    parcelasRows.push(...((data as ParcelaOcorrencia[] | null) ?? []));
  }
  if (parcelasRows.length === 0) return { excluidas: 0 };
  const comBaixa = new Set<string>();
  for (const lote of emLotes(parcelasRows.map((p) => p.id))) {
    const { data, error: erroBaixas } = await supabase.from("fin_baixas").select("parcela_id").eq("unidade_id", params.unidadeId).in("parcela_id", lote);
    if (erroBaixas) throw new Error(erroBaixas.message);
    for (const b of (data as { parcela_id: string }[] | null) ?? []) comBaixa.add(b.parcela_id);
  }

  const porLancamento = new Map<string, typeof parcelasRows>();
  for (const p of parcelasRows) porLancamento.set(p.lancamento_id, [...(porLancamento.get(p.lancamento_id) ?? []), p]);
  const excluir = ids.filter((id) => {
    const lista = porLancamento.get(id) ?? [];
    return lista.length > 0 && lista.every((p) => p.data_prevista >= params.aPartirDe && !comBaixa.has(p.id));
  });
  if (excluir.length === 0) return { excluidas: 0 };

  for (const lote of emLotes(excluir)) {
    const { error: erroExclusao } = await supabase.from("fin_lancamentos").delete().eq("unidade_id", params.unidadeId).in("id", lote);
    if (erroExclusao) throw erroDeNegocio(erroExclusao);
  }
  return { excluidas: excluir.length };
}

function emLotes<T>(itens: T[], tamanho = 100): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

// ── Provisões ───────────────────────────────────────────────────────────────

type ParametrosRow = {
  id: string;
  vigente_desde: string;
  percentual_ferias: number;
  percentual_adicional_terco: number;
  percentual_encargos_ferias: number;
  percentual_decimo_terceiro: number;
  percentual_encargos_decimo_terceiro: number;
  percentual_multa_fgts: number;
  criado_por: string;
  criado_em: string;
};

export async function listarParametrosProvisao(unidadeId: string): Promise<ParametrosProvisaoRegistro[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_provisoes_parametros")
    .select("*")
    .eq("unidade_id", unidadeId)
    .order("vigente_desde", { ascending: false })
    .order("criado_em", { ascending: false });
  const linhas = (data as ParametrosRow[] | null) ?? [];
  const nomes = await nomesPorUserId(supabase, linhas.map((l) => l.criado_por));
  return linhas.map((l) => ({
    id: l.id,
    vigenteDesde: l.vigente_desde,
    percentualFerias: Number(l.percentual_ferias),
    percentualAdicionalTerco: Number(l.percentual_adicional_terco),
    percentualEncargosFerias: Number(l.percentual_encargos_ferias),
    percentualDecimoTerceiro: Number(l.percentual_decimo_terceiro),
    percentualEncargosDecimoTerceiro: Number(l.percentual_encargos_decimo_terceiro),
    percentualMultaFgts: Number(l.percentual_multa_fgts),
    criadoPorNome: nomes.get(l.criado_por) ?? "Usuário",
    criadoEm: l.criado_em,
  }));
}

export async function salvarParametrosProvisao(params: ParametrosProvisao & { unidadeId: string; vigenteDesde: string; criadoPor: string }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fin_provisoes_parametros").insert({
    unidade_id: params.unidadeId,
    vigente_desde: `${params.vigenteDesde}-01`,
    percentual_ferias: params.percentualFerias,
    percentual_adicional_terco: params.percentualAdicionalTerco,
    percentual_encargos_ferias: params.percentualEncargosFerias,
    percentual_decimo_terceiro: params.percentualDecimoTerceiro,
    percentual_encargos_decimo_terceiro: params.percentualEncargosDecimoTerceiro,
    percentual_multa_fgts: params.percentualMultaFgts,
    criado_por: params.criadoPor,
  });
  if (error) throw erroDeNegocio(error);
}

type ReversaoRow = { id: string; tipo: TipoProvisao; competencia: string; valor: number; motivo: string; criado_por: string; criado_em: string };

export async function listarReversoesProvisao(unidadeId: string): Promise<ReversaoProvisao[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_provisoes_reversoes")
    .select("id, tipo, competencia, valor, motivo, criado_por, criado_em")
    .eq("unidade_id", unidadeId)
    .order("competencia", { ascending: false });
  const linhas = (data as ReversaoRow[] | null) ?? [];
  const nomes = await nomesPorUserId(supabase, linhas.map((l) => l.criado_por));
  return linhas.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    competencia: l.competencia,
    valor: Number(l.valor),
    motivo: l.motivo,
    criadoPorNome: nomes.get(l.criado_por) ?? "Usuário",
    criadoEm: l.criado_em,
  }));
}

export async function criarReversaoProvisao(params: {
  unidadeId: string;
  tipo: TipoProvisao;
  competencia: string;
  valor: number;
  motivo: string;
  criadoPor: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fin_provisoes_reversoes").insert({
    unidade_id: params.unidadeId,
    tipo: params.tipo,
    competencia: `${params.competencia}-01`,
    valor: params.valor,
    motivo: params.motivo,
    criado_por: params.criadoPor,
  });
  if (error) throw erroDeNegocio(error);
}

export async function excluirReversaoProvisao(params: { unidadeId: string; id: string }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fin_provisoes_reversoes").delete().eq("unidade_id", params.unidadeId).eq("id", params.id);
  if (error) throw erroDeNegocio(error);
}

// ── Fechamento mensal e auditoria ───────────────────────────────────────────

type FechamentoRow = { competencia: string; fechado: boolean; motivo_reabertura: string; atualizado_por: string; atualizado_em: string };

export async function listarFechamentos(unidadeId: string): Promise<FechamentoMensal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_fechamentos")
    .select("competencia, fechado, motivo_reabertura, atualizado_por, atualizado_em")
    .eq("unidade_id", unidadeId);
  const linhas = (data as FechamentoRow[] | null) ?? [];
  const nomes = await nomesPorUserId(supabase, linhas.map((l) => l.atualizado_por));
  return linhas.map((l) => ({
    competencia: l.competencia,
    fechado: l.fechado,
    motivoReabertura: l.motivo_reabertura,
    atualizadoPorNome: nomes.get(l.atualizado_por) ?? "Usuário",
    atualizadoEm: l.atualizado_em,
  }));
}

/** Meses fechados (AAAA-MM) - usado pra barrar o Operacional com mensagem
 * clara antes de gravar (a barreira real é o gatilho
 * `bloquear_periodo_fechado_financeiro`). */
export async function competenciasFechadas(unidadeId: string): Promise<Set<string>> {
  const fechamentos = await listarFechamentos(unidadeId);
  return new Set(fechamentos.filter((f) => f.fechado).map((f) => f.competencia.slice(0, 7)));
}

export async function salvarFechamento(params: {
  unidadeId: string;
  competencia: string;
  fechado: boolean;
  motivo: string;
  atualizadoPor: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fin_fechamentos").upsert(
    {
      unidade_id: params.unidadeId,
      competencia: `${params.competencia}-01`,
      fechado: params.fechado,
      motivo_reabertura: params.fechado ? "" : params.motivo,
      atualizado_por: params.atualizadoPor,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "unidade_id,competencia" },
  );
  if (error) throw erroDeNegocio(error);
}

type AuditoriaRow = {
  id: string;
  criado_em: string;
  acao: string;
  entidade: string;
  entidade_id: string;
  autor: string;
  dados_antigos: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
};

export async function listarAuditoriaFinanceiro(unidadeId: string): Promise<RegistroAuditoria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listar_auditoria_financeiro_gerencial", { p_unidade_id: unidadeId, p_limite: 300 });
  if (error) throw new Error(error.message);
  return ((data as AuditoriaRow[] | null) ?? []).map((r) => ({
    id: r.id,
    criadoEm: r.criado_em,
    acao: r.acao,
    entidade: r.entidade,
    entidadeId: r.entidade_id,
    autor: r.autor,
    dadosAntigos: r.dados_antigos,
    dadosNovos: r.dados_novos,
  }));
}
