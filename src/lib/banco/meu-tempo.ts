import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { calcularDuracaoMinutosPorHorario, calcularDuracaoSegundosCronometro, dataLocalBrasil, horaLocalBrasil } from "@/lib/meu-tempo/tempo";
import type {
  FrenteTempo,
  LancamentoTempo,
  MetaMensalTempo,
  OrigemLancamentoTempo,
  StatusLancamentoTempo,
  TipoFrenteTempo,
  TipoTrabalhoTempo,
  ValorHoraTempo,
} from "@/lib/meu-tempo/tipos";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Uma linha manual do formulário: ou horário (início/fim, duração calculada)
 * ou duração direta (sem hora nenhuma) - "ambos os jeitos são livres",
 * decisão explícita de Vinícius. */
export type TempoManualEntrada =
  | { modo: "horario"; horaInicio: string; horaFim: string }
  | { modo: "duracao"; duracaoMinutos: number };

/** Erros de negócio levantados pelo gatilho `impedir_alteracao_historico_tempo`
 * ou pelas constraints/índices únicos das tabelas `zh_tempo_*` chegam aqui
 * como erro do Postgres - nunca um texto interno vazando pra tela. */
function erroDeNegocio(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new ErroPublico("Já existe um registro com esses dados (ex: mesma data de vigência, ou cronômetro já em andamento).");
  }
  if (error.code === "42501" || error.code === "23514") return new ErroPublico(error.message);
  return new Error(error.message);
}

// ── Frentes ──────────────────────────────────────────────────────────────

type FrenteRow = { id: string; nome: string; tipo: TipoFrenteTempo; ativo: boolean };

function frenteDaLinha(row: FrenteRow): FrenteTempo {
  return { id: row.id, nome: row.nome, tipo: row.tipo, ativo: row.ativo };
}

export async function listarFrentesTempo(userId: string, somenteAtivas = false): Promise<FrenteTempo[]> {
  const supabase = await createClient();
  let query = supabase.from("zh_tempo_frentes").select("id, nome, tipo, ativo").eq("criado_por", userId).order("nome");
  if (somenteAtivas) query = query.eq("ativo", true);
  const { data } = await query;
  return ((data as FrenteRow[] | null) ?? []).map(frenteDaLinha);
}

export async function criarFrenteTempo(params: { userId: string; nome: string; tipo: TipoFrenteTempo }): Promise<FrenteTempo> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_tempo_frentes")
    .insert({ criado_por: params.userId, nome: params.nome, tipo: params.tipo })
    .select("id, nome, tipo, ativo")
    .single();
  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao criar frente" });
  return frenteDaLinha(data as FrenteRow);
}

/** Edita nome/tipo/ativo em linha (frente não é histórico, diferente de
 * valor-hora e meta mensal abaixo) - desativar (`ativo = false`) nunca apaga
 * histórico de lançamento/valor/meta já gravado, só tira a frente da lista
 * de escolha do cronômetro/lançamento manual. */
export async function editarFrenteTempo(params: {
  userId: string;
  id: string;
  nome: string;
  tipo: TipoFrenteTempo;
  ativo: boolean;
}): Promise<FrenteTempo> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_tempo_frentes")
    .update({ nome: params.nome, tipo: params.tipo, ativo: params.ativo })
    .eq("criado_por", params.userId)
    .eq("id", params.id)
    .select("id, nome, tipo, ativo")
    .single();
  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao editar frente" });
  return frenteDaLinha(data as FrenteRow);
}

// ── Valor-hora vigente (histórico imutável) ───────────────────────────────

type ValorHoraRow = { id: string; valor: number; vigente_desde: string };

function valorHoraDaLinha(row: ValorHoraRow): ValorHoraTempo {
  return { id: row.id, valor: Number(row.valor), vigenteDesde: row.vigente_desde };
}

/** Mais recente primeiro - mesma ordem que `itemVigenteEm` espera receber. */
export async function listarValoresHoraTempo(userId: string): Promise<ValorHoraTempo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("zh_tempo_valores_hora")
    .select("id, valor, vigente_desde")
    .eq("criado_por", userId)
    .order("vigente_desde", { ascending: false });
  return ((data as ValorHoraRow[] | null) ?? []).map(valorHoraDaLinha);
}

/** Correção de valor-hora é sempre uma linha nova - nunca um UPDATE (o
 * gatilho `impedir_alteracao_historico_tempo` bloqueia mesmo se alguém
 * tentasse). */
export async function criarValorHoraTempo(params: { userId: string; valor: number; vigenteDesde: string }): Promise<ValorHoraTempo> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_tempo_valores_hora")
    .insert({ criado_por: params.userId, valor: params.valor, vigente_desde: params.vigenteDesde })
    .select("id, valor, vigente_desde")
    .single();
  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao salvar valor-hora" });
  return valorHoraDaLinha(data as ValorHoraRow);
}

// ── Meta mensal por frente (histórico imutável) ───────────────────────────

type MetaMensalRow = { id: string; frente_id: string; valor_mensal: number | null; vigente_desde: string };

function metaMensalDaLinha(row: MetaMensalRow): MetaMensalTempo {
  return {
    id: row.id,
    frenteId: row.frente_id,
    valorMensal: row.valor_mensal === null ? null : Number(row.valor_mensal),
    vigenteDesde: row.vigente_desde,
  };
}

/** Todas as frentes juntas, mais recente primeiro - quem chama filtra por
 * `frenteId` quando precisar (ver `montarPainelMensal`). */
export async function listarMetasMensaisTempo(userId: string): Promise<MetaMensalTempo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("zh_tempo_metas_mensais")
    .select("id, frente_id, valor_mensal, vigente_desde")
    .eq("criado_por", userId)
    .order("vigente_desde", { ascending: false });
  return ((data as MetaMensalRow[] | null) ?? []).map(metaMensalDaLinha);
}

export async function criarMetaMensalTempo(params: {
  userId: string;
  frenteId: string;
  valorMensal: number;
  vigenteDesde: string;
}): Promise<MetaMensalTempo> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_tempo_metas_mensais")
    .insert({ criado_por: params.userId, frente_id: params.frenteId, valor_mensal: params.valorMensal, vigente_desde: params.vigenteDesde })
    .select("id, frente_id, valor_mensal, vigente_desde")
    .single();
  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao salvar meta mensal" });
  return metaMensalDaLinha(data as MetaMensalRow);
}

// ── Lançamentos (cronômetro ou manual) ────────────────────────────────────

type LancamentoRow = {
  id: string;
  frente_id: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  duracao_minutos: number | null;
  tipo_trabalho: TipoTrabalhoTempo;
  observacao: string;
  origem: OrigemLancamentoTempo;
  status: StatusLancamentoTempo;
  iniciado_em: string | null;
  encerrado_em: string | null;
  pausado_desde: string | null;
  segundos_pausados_acumulados: number;
  criado_em: string;
  zh_tempo_frentes: { nome: string } | null;
};

const COLUNAS_LANCAMENTO =
  "id, frente_id, data, hora_inicio, hora_fim, duracao_minutos, tipo_trabalho, observacao, origem, status, iniciado_em, encerrado_em, pausado_desde, segundos_pausados_acumulados, criado_em, zh_tempo_frentes(nome)";

/** Colunas `time` do Postgres voltam como "HH:MM:SS" - normaliza pra "HH:MM"
 * (mesmo formato que o `<input type="time">` e o schema de validação usam). */
function lancamentoDaLinha(row: LancamentoRow): LancamentoTempo {
  return {
    id: row.id,
    frenteId: row.frente_id,
    frenteNome: row.zh_tempo_frentes?.nome ?? "",
    data: row.data,
    horaInicio: row.hora_inicio?.slice(0, 5) ?? null,
    horaFim: row.hora_fim?.slice(0, 5) ?? null,
    duracaoMinutos: row.duracao_minutos,
    tipoTrabalho: row.tipo_trabalho,
    observacao: row.observacao,
    origem: row.origem,
    status: row.status,
    iniciadoEm: row.iniciado_em,
    encerradoEm: row.encerrado_em,
    pausadoDesde: row.pausado_desde,
    segundosPausadosAcumulados: row.segundos_pausados_acumulados,
    criadoEm: row.criado_em,
  };
}

/** Só lançamentos encerrados - status "de verdade" pra Histórico/Painel
 * mensal. O cronômetro em andamento/pausado vive só na tela Hoje, ver
 * `obterLancamentoAtivoTempo`. */
export async function listarLancamentosTempo(
  userId: string,
  filtro?: { de?: string; ate?: string; frenteId?: string; tipoTrabalho?: TipoTrabalhoTempo },
): Promise<LancamentoTempo[]> {
  const supabase = await createClient();
  let query = supabase
    .from("zh_tempo_lancamentos")
    .select(COLUNAS_LANCAMENTO)
    .eq("criado_por", userId)
    .eq("status", "encerrado")
    .order("data", { ascending: false });

  if (filtro?.de) query = query.gte("data", filtro.de);
  if (filtro?.ate) query = query.lte("data", filtro.ate);
  if (filtro?.frenteId) query = query.eq("frente_id", filtro.frenteId);
  if (filtro?.tipoTrabalho) query = query.eq("tipo_trabalho", filtro.tipoTrabalho);

  const { data } = await query;
  return ((data as unknown as LancamentoRow[] | null) ?? []).map(lancamentoDaLinha);
}

/** Cronômetro em andamento ou pausado dessa pessoa - nunca mais de 1 (índice
 * único parcial `zh_tempo_lancamentos_unico_ativo` + `iniciarCronometroTempo`
 * sempre encerra o anterior antes de abrir outro). */
export async function obterLancamentoAtivoTempo(userId: string): Promise<LancamentoTempo | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("zh_tempo_lancamentos")
    .select(COLUNAS_LANCAMENTO)
    .eq("criado_por", userId)
    .in("status", ["em_andamento", "pausado"])
    .maybeSingle();
  if (!data) return null;
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

async function obterLancamentoTempoPorId(supabase: SupabaseClient, userId: string, id: string): Promise<LancamentoTempo | null> {
  const { data } = await supabase.from("zh_tempo_lancamentos").select(COLUNAS_LANCAMENTO).eq("criado_por", userId).eq("id", id).maybeSingle();
  if (!data) return null;
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

/** Fecha um cronômetro (em_andamento ou pausado) calculando a duração real -
 * desconta o tempo pausado, nunca deixa duração menor que 1 minuto. Usada
 * tanto pelo "Encerrar" explícito quanto pela troca automática de frente
 * (`iniciarCronometroTempo` chama isto no cronômetro anterior antes de abrir
 * o novo). */
async function encerrarCronometroInterno(supabase: SupabaseClient, userId: string, lancamento: LancamentoTempo): Promise<LancamentoTempo> {
  if (!lancamento.iniciadoEm) throw new Error("Cronômetro sem iniciado_em - dado inconsistente");
  const agora = new Date();
  let segundosPausados = lancamento.segundosPausadosAcumulados;
  if (lancamento.status === "pausado" && lancamento.pausadoDesde) {
    segundosPausados += Math.round((agora.getTime() - new Date(lancamento.pausadoDesde).getTime()) / 1000);
  }
  const duracaoSegundos = calcularDuracaoSegundosCronometro({
    iniciadoEm: new Date(lancamento.iniciadoEm),
    encerradoEm: agora,
    segundosPausadosAcumulados: segundosPausados,
  });
  const duracaoMinutos = Math.max(1, Math.round(duracaoSegundos / 60));

  const { data, error } = await supabase
    .from("zh_tempo_lancamentos")
    .update({
      status: "encerrado",
      encerrado_em: agora.toISOString(),
      pausado_desde: null,
      segundos_pausados_acumulados: segundosPausados,
      duracao_minutos: duracaoMinutos,
      hora_inicio: horaLocalBrasil(new Date(lancamento.iniciadoEm)),
      hora_fim: horaLocalBrasil(agora),
    })
    .eq("criado_por", userId)
    .eq("id", lancamento.id)
    .select(COLUNAS_LANCAMENTO)
    .single();

  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao encerrar cronômetro" });
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

/** Escolhe frente, inicia - se já houver um cronômetro ativo (em_andamento ou
 * pausado, de qualquer frente), encerra automaticamente antes de abrir o
 * novo (spec: "Trocar de frente com cronômetro ativo encerra automaticamente
 * o anterior"). `tipo_trabalho` nasce "execucao" (ajustável depois, editando
 * o lançamento já encerrado no Histórico) - início do cronômetro fica só em
 * "escolhe frente, inicia", sem pedir mais nada. */
export async function iniciarCronometroTempo(params: { userId: string; frenteId: string }): Promise<LancamentoTempo> {
  const supabase = await createClient();

  const ativo = await obterLancamentoAtivoTempo(params.userId);
  if (ativo) await encerrarCronometroInterno(supabase, params.userId, ativo);

  const agora = new Date();
  const { data, error } = await supabase
    .from("zh_tempo_lancamentos")
    .insert({
      criado_por: params.userId,
      frente_id: params.frenteId,
      data: dataLocalBrasil(agora),
      tipo_trabalho: "execucao",
      origem: "cronometro",
      status: "em_andamento",
      iniciado_em: agora.toISOString(),
    })
    .select(COLUNAS_LANCAMENTO)
    .single();

  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao iniciar cronômetro" });
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

export async function pausarCronometroTempo(params: { userId: string; id: string }): Promise<LancamentoTempo> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_tempo_lancamentos")
    .update({ status: "pausado", pausado_desde: new Date().toISOString() })
    .eq("criado_por", params.userId)
    .eq("id", params.id)
    .eq("status", "em_andamento")
    .select(COLUNAS_LANCAMENTO)
    .single();
  if (error || !data) throw erroDeNegocio(error ?? { message: "Cronômetro não está em andamento." });
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

export async function retomarCronometroTempo(params: { userId: string; id: string }): Promise<LancamentoTempo> {
  const supabase = await createClient();
  const atual = await obterLancamentoTempoPorId(supabase, params.userId, params.id);
  if (!atual || atual.status !== "pausado" || !atual.pausadoDesde) {
    throw new ErroPublico("Cronômetro não está pausado.");
  }
  const segundosPausadosNovo = atual.segundosPausadosAcumulados + Math.round((Date.now() - new Date(atual.pausadoDesde).getTime()) / 1000);

  const { data, error } = await supabase
    .from("zh_tempo_lancamentos")
    .update({ status: "em_andamento", pausado_desde: null, segundos_pausados_acumulados: segundosPausadosNovo })
    .eq("criado_por", params.userId)
    .eq("id", params.id)
    .eq("status", "pausado")
    .select(COLUNAS_LANCAMENTO)
    .single();
  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao retomar cronômetro" });
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

export async function encerrarCronometroTempo(params: { userId: string; id: string }): Promise<LancamentoTempo> {
  const supabase = await createClient();
  const lancamento = await obterLancamentoTempoPorId(supabase, params.userId, params.id);
  if (!lancamento || lancamento.status === "encerrado") {
    throw new ErroPublico("Cronômetro não encontrado ou já encerrado.");
  }
  return encerrarCronometroInterno(supabase, params.userId, lancamento);
}

/** Resolve hora_inicio/hora_fim/duração a partir do modo escolhido no
 * formulário - "horario" calcula a duração (exige fim depois do início),
 * "duracao" grava direto sem hora nenhuma. */
function resolverTempoManual(tempo: TempoManualEntrada): { horaInicio: string | null; horaFim: string | null; duracaoMinutos: number } {
  if (tempo.modo === "horario") {
    const duracao = calcularDuracaoMinutosPorHorario(tempo.horaInicio, tempo.horaFim);
    if (duracao <= 0) throw new ErroPublico("A hora de fim precisa ser depois da hora de início.");
    return { horaInicio: tempo.horaInicio, horaFim: tempo.horaFim, duracaoMinutos: duracao };
  }
  return { horaInicio: null, horaFim: null, duracaoMinutos: tempo.duracaoMinutos };
}

export async function criarLancamentoManualTempo(params: {
  userId: string;
  frenteId: string;
  data: string;
  tempo: TempoManualEntrada;
  tipoTrabalho: TipoTrabalhoTempo;
  observacao: string;
}): Promise<LancamentoTempo> {
  const supabase = await createClient();
  const { horaInicio, horaFim, duracaoMinutos } = resolverTempoManual(params.tempo);

  const { data, error } = await supabase
    .from("zh_tempo_lancamentos")
    .insert({
      criado_por: params.userId,
      frente_id: params.frenteId,
      data: params.data,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      duracao_minutos: duracaoMinutos,
      tipo_trabalho: params.tipoTrabalho,
      observacao: params.observacao,
      origem: "manual",
      status: "encerrado",
    })
    .select(COLUNAS_LANCAMENTO)
    .single();

  if (error || !data) throw erroDeNegocio(error ?? { message: "Falha ao criar lançamento" });
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

/** Só edita lançamento manual ou já encerrado (`status = 'encerrado'` no
 * WHERE - RLS de UPDATE não restringe isso sozinha, é a mesma condição da
 * policy de DELETE aplicada aqui também pra nunca reescrever um cronômetro
 * em andamento por essa via). */
export async function editarLancamentoTempo(params: {
  userId: string;
  id: string;
  frenteId: string;
  data: string;
  tempo: TempoManualEntrada;
  tipoTrabalho: TipoTrabalhoTempo;
  observacao: string;
}): Promise<LancamentoTempo> {
  const supabase = await createClient();
  const { horaInicio, horaFim, duracaoMinutos } = resolverTempoManual(params.tempo);

  const { data, error } = await supabase
    .from("zh_tempo_lancamentos")
    .update({
      frente_id: params.frenteId,
      data: params.data,
      hora_inicio: horaInicio,
      hora_fim: horaFim,
      duracao_minutos: duracaoMinutos,
      tipo_trabalho: params.tipoTrabalho,
      observacao: params.observacao,
    })
    .eq("criado_por", params.userId)
    .eq("id", params.id)
    .eq("status", "encerrado")
    .select(COLUNAS_LANCAMENTO)
    .single();

  if (error || !data) throw erroDeNegocio(error ?? { message: "Lançamento não encontrado ou não pode ser editado." });
  return lancamentoDaLinha(data as unknown as LancamentoRow);
}

export async function excluirLancamentoTempo(params: { userId: string; id: string }): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("zh_tempo_lancamentos")
    .delete({ count: "exact" })
    .eq("criado_por", params.userId)
    .eq("id", params.id)
    .eq("status", "encerrado");
  if (error) throw erroDeNegocio(error);
  if (!count) throw new ErroPublico("Lançamento não encontrado ou não pode ser excluído.");
}
