import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { diaDaSemanaIso } from "@/lib/agenda/grade";
import { TETO_PRIORIDADES } from "@/lib/agenda/tipos";
import type { ExecucaoRotina, RotinaAgenda, SituacaoItem, TarefaAgenda, TipoRotina } from "@/lib/agenda/tipos";

/** Acesso ao banco do módulo Agenda. Rotina é só leitura por aqui: quem
 * escreve `zh_agenda_rotinas` é o script de publicação, a partir da grade do
 * Cérebro do Gestor (não existe policy de insert/update pela aplicação).
 *
 * Faixa que saiu da grade continua no banco com `ativa = false`, para não
 * perder tarefa nem histórico. As leituras da tela trazem só as ativas; a
 * tarefa que ficou presa a uma inativa aparece com aviso (ver `montarDia`). */

type RotinaRow = {
  id: string;
  dia_semana: number;
  chave: string;
  ordem: number;
  hora_inicio: string | null;
  hora_fim: string | null;
  horario_texto: string;
  rotulo: string;
  tipo: TipoRotina;
};

type TarefaRow = {
  id: string;
  data: string;
  titulo: string;
  detalhe: string;
  prioridade: boolean;
  prioridade_posicao: number | null;
  ordem: number;
  situacao: SituacaoItem;
  rotina_id: string | null;
};

const CAMPOS_ROTINA = "id, dia_semana, chave, ordem, hora_inicio, hora_fim, horario_texto, rotulo, tipo";
const CAMPOS_TAREFA = "id, data, titulo, detalhe, prioridade, prioridade_posicao, ordem, situacao, rotina_id";

/** `time` do Postgres volta como "09:00:00" - a tela usa "09:00". */
function horaCurtaBanco(valor: string | null): string | null {
  return valor ? valor.slice(0, 5) : null;
}

function rotinaDaLinha(row: RotinaRow): RotinaAgenda {
  return {
    id: row.id,
    diaSemana: row.dia_semana,
    chave: row.chave,
    ordem: row.ordem,
    horaInicio: horaCurtaBanco(row.hora_inicio),
    horaFim: horaCurtaBanco(row.hora_fim),
    horarioTexto: row.horario_texto,
    rotulo: row.rotulo,
    tipo: row.tipo,
  };
}

function tarefaDaLinha(row: TarefaRow): TarefaAgenda {
  return {
    id: row.id,
    data: row.data,
    titulo: row.titulo,
    detalhe: row.detalhe,
    prioridade: row.prioridade,
    prioridadePosicao: row.prioridade_posicao,
    ordem: row.ordem,
    situacao: row.situacao,
    rotinaId: row.rotina_id,
  };
}

/** Violação do índice único parcial `zh_agenda_tarefas_prioridade_unica`, que
 * é o teto de 4 prioridades no banco. Distinguir importa: é a única corrida
 * que a aplicação tenta de novo sozinha, em vez de mostrar erro. */
function ehColisaoDePrioridade(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" && Boolean(error.message?.includes("prioridade"));
}

function erroDeNegocio(error: { code?: string; message: string }): Error {
  if (ehColisaoDePrioridade(error)) {
    return new ErroPublico(
      `O dia já tem ${TETO_PRIORIDADES} prioridades. Tire uma da lista antes de incluir outra - a quinta prioridade não é prioridade.`
    );
  }
  if (error.code === "23505") return new ErroPublico("Esse item já está marcado nesse dia.");
  if (error.code === "42501" || error.code === "23514") return new ErroPublico(error.message);
  return new Error(error.message);
}

// ── Leitura ───────────────────────────────────────────────────────────────

export async function listarRotinasDoDia(userId: string, diaSemana: number): Promise<RotinaAgenda[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_agenda_rotinas")
    .select(CAMPOS_ROTINA)
    .eq("criado_por", userId)
    .eq("dia_semana", diaSemana)
    .eq("ativa", true)
    .order("ordem");

  if (error) throw erroDeNegocio(error);
  return (data ?? []).map(rotinaDaLinha);
}

export async function listarRotinasDaSemana(userId: string): Promise<RotinaAgenda[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_agenda_rotinas")
    .select(CAMPOS_ROTINA)
    .eq("criado_por", userId)
    .eq("ativa", true)
    .order("dia_semana")
    .order("ordem");

  if (error) throw erroDeNegocio(error);
  return (data ?? []).map(rotinaDaLinha);
}

/** Quando a grade foi publicada pela última vez - a tela avisa quando está
 * velha, porque rotina desatualizada aqui significa divergência com o vault. */
export async function obterPublicacaoDaGrade(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_agenda_rotinas")
    .select("publicado_em")
    .eq("criado_por", userId)
    .order("publicado_em", { ascending: false })
    .limit(1);

  if (error) throw erroDeNegocio(error);
  return data?.[0]?.publicado_em ?? null;
}

export async function listarTarefasDoDia(userId: string, data: string): Promise<TarefaAgenda[]> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase
    .from("zh_agenda_tarefas")
    .select(CAMPOS_TAREFA)
    .eq("criado_por", userId)
    .eq("data", data)
    .order("prioridade", { ascending: false })
    .order("prioridade_posicao", { nullsFirst: false })
    .order("ordem");

  if (error) throw erroDeNegocio(error);
  return (linhas ?? []).map(tarefaDaLinha);
}

export async function listarExecucoesDoDia(userId: string, data: string): Promise<ExecucaoRotina[]> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase
    .from("zh_agenda_execucoes")
    .select("rotina_id, situacao, observacao")
    .eq("criado_por", userId)
    .eq("data", data);

  if (error) throw erroDeNegocio(error);
  return (linhas ?? []).map((linha) => ({
    rotinaId: linha.rotina_id,
    situacao: linha.situacao,
    observacao: linha.observacao,
  }));
}

// ── Coerência da faixa apontada ───────────────────────────────────────────

/** A faixa precisa ser do próprio usuário, estar ativa na grade, ser do mesmo
 * dia da semana da data e de um tipo que aquela seção aceita. A chave estrangeira composta e o gatilho
 * `validar_faixa_da_agenda` repetem isso no banco; aqui a checagem existe para
 * a mensagem explicar o que houve, em vez de estourar violação de constraint. */
async function exigirFaixaValida(
  userId: string,
  rotinaId: string,
  data: string,
  tiposAceitos: TipoRotina[]
): Promise<void> {
  const supabase = await createClient();
  const { data: linhas, error } = await supabase
    .from("zh_agenda_rotinas")
    .select("dia_semana, tipo, rotulo, ativa")
    .eq("criado_por", userId)
    .eq("id", rotinaId)
    .limit(1);

  if (error) throw erroDeNegocio(error);

  const faixa = linhas?.[0];
  if (!faixa) throw new ErroPublico("Essa faixa da agenda não existe mais. Recarregue o dia e escolha outra.");

  if (!faixa.ativa) {
    throw new ErroPublico(`"${faixa.rotulo}" saiu da agenda semanal. Escolha outro bloco.`);
  }

  if (faixa.dia_semana !== diaDaSemanaIso(data)) {
    throw new ErroPublico("A faixa escolhida é de outro dia da semana.");
  }

  if (!tiposAceitos.includes(faixa.tipo)) {
    throw new ErroPublico(`"${faixa.rotulo}" não é um bloco de trabalho, então não recebe tarefa.`);
  }
}

// ── Escrita ───────────────────────────────────────────────────────────────

export type TarefaEntrada = {
  data: string;
  titulo: string;
  detalhe: string;
  prioridade: boolean;
  rotinaId: string | null;
};

/** Posições de prioridade livres no dia, em ordem. O teto de verdade é o
 * índice único parcial no banco: contar aqui só serve para escolher a posição
 * e para a mensagem sair boa quando o dia já está cheio. */
async function posicoesLivres(userId: string, data: string, idIgnorado?: string): Promise<number[]> {
  const supabase = await createClient();
  let query = supabase
    .from("zh_agenda_tarefas")
    .select("prioridade_posicao")
    .eq("criado_por", userId)
    .eq("data", data)
    .not("prioridade_posicao", "is", null);

  if (idIgnorado) query = query.neq("id", idIgnorado);

  const { data: linhas, error } = await query;
  if (error) throw erroDeNegocio(error);

  const usadas = new Set((linhas ?? []).map((linha) => linha.prioridade_posicao));
  return [1, 2, 3, 4].filter((posicao) => !usadas.has(posicao));
}

/** Tenta gravar ocupando uma posição livre. Duas requisições simultâneas podem
 * escolher a mesma posição; nesse caso o índice único derruba uma delas e a
 * outra tentativa pega a posição seguinte. O teto nunca é furado, e o usuário
 * não vê erro por uma corrida que o próprio sistema resolve. */
type ResultadoGravacao = { data: TarefaRow | null; error: { code?: string; message: string } | null };

async function gravarComPosicao(
  userId: string,
  data: string,
  idIgnorado: string | undefined,
  gravar: (posicao: number | null) => Promise<ResultadoGravacao>
): Promise<TarefaAgenda> {
  const livres = await posicoesLivres(userId, data, idIgnorado);

  if (livres.length === 0) {
    throw new ErroPublico(
      `O dia já tem ${TETO_PRIORIDADES} prioridades. Tire uma da lista antes de incluir outra - a quinta prioridade não é prioridade.`
    );
  }

  let ultimoErro: { code?: string; message: string } | null = null;

  for (const posicao of livres) {
    const { data: linha, error } = await gravar(posicao);
    if (!error && linha) return tarefaDaLinha(linha);
    if (error && !ehColisaoDePrioridade(error)) throw erroDeNegocio(error);
    ultimoErro = error;
  }

  throw erroDeNegocio(ultimoErro ?? { code: "23505", message: "prioridade" });
}

export async function criarTarefaAgenda(userId: string, entrada: TarefaEntrada): Promise<TarefaAgenda> {
  if (entrada.rotinaId) await exigirFaixaValida(userId, entrada.rotinaId, entrada.data, ["bloco"]);

  const supabase = await createClient();
  const { data: ultima, error: erroOrdem } = await supabase
    .from("zh_agenda_tarefas")
    .select("ordem")
    .eq("criado_por", userId)
    .eq("data", entrada.data)
    .order("ordem", { ascending: false })
    .limit(1);

  if (erroOrdem) throw erroDeNegocio(erroOrdem);

  const linhaBase = {
    criado_por: userId,
    data: entrada.data,
    titulo: entrada.titulo,
    detalhe: entrada.detalhe,
    prioridade: entrada.prioridade,
    rotina_id: entrada.rotinaId,
    ordem: (ultima?.[0]?.ordem ?? -1) + 1,
  };

  const inserir = async (posicao: number | null): Promise<ResultadoGravacao> =>
    supabase
      .from("zh_agenda_tarefas")
      .insert({ ...linhaBase, prioridade_posicao: posicao })
      .select(CAMPOS_TAREFA)
      .single();

  if (!entrada.prioridade) {
    const { data, error } = await inserir(null);
    if (error || !data) throw erroDeNegocio(error ?? { message: "Não foi possível salvar a tarefa." });
    return tarefaDaLinha(data);
  }

  return gravarComPosicao(userId, entrada.data, undefined, inserir);
}

export async function editarTarefaAgenda(userId: string, id: string, entrada: TarefaEntrada): Promise<TarefaAgenda> {
  if (entrada.rotinaId) await exigirFaixaValida(userId, entrada.rotinaId, entrada.data, ["bloco"]);

  const supabase = await createClient();
  const { data: atuais, error: erroAtual } = await supabase
    .from("zh_agenda_tarefas")
    .select("data, prioridade_posicao")
    .eq("criado_por", userId)
    .eq("id", id)
    .limit(1);

  if (erroAtual) throw erroDeNegocio(erroAtual);
  const atual = atuais?.[0];
  if (!atual) throw new ErroPublico("Essa tarefa não existe mais.");

  const camposBase = {
    data: entrada.data,
    titulo: entrada.titulo,
    detalhe: entrada.detalhe,
    prioridade: entrada.prioridade,
    rotina_id: entrada.rotinaId,
  };

  const atualizar = async (posicao: number | null): Promise<ResultadoGravacao> =>
    supabase
      .from("zh_agenda_tarefas")
      .update({ ...camposBase, prioridade_posicao: posicao })
      .eq("criado_por", userId)
      .eq("id", id)
      .select(CAMPOS_TAREFA)
      .single();

  // Já era prioridade e continua no mesmo dia: mantém a posição, sem disputar
  // vaga com ela mesma.
  const mantemPosicao = entrada.prioridade && atual.prioridade_posicao !== null && atual.data === entrada.data;

  if (!entrada.prioridade || mantemPosicao) {
    const { data, error } = await atualizar(entrada.prioridade ? atual.prioridade_posicao : null);
    if (error || !data) throw erroDeNegocio(error ?? { message: "Não foi possível salvar a tarefa." });
    return tarefaDaLinha(data);
  }

  return gravarComPosicao(userId, entrada.data, id, atualizar);
}

export async function marcarSituacaoTarefa(userId: string, id: string, situacao: SituacaoItem): Promise<TarefaAgenda> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zh_agenda_tarefas")
    .update({ situacao })
    .eq("criado_por", userId)
    .eq("id", id)
    .select(CAMPOS_TAREFA)
    .single();

  if (error) throw erroDeNegocio(error);
  return tarefaDaLinha(data);
}

export async function excluirTarefaAgenda(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("zh_agenda_tarefas").delete().eq("criado_por", userId).eq("id", id);
  if (error) throw erroDeNegocio(error);
}

/** Marca (ou desmarca) uma rotina da grade num dia. `situacao = 'pendente'`
 * apaga a linha - a ausência de marcação é o estado inicial. */
export async function marcarExecucaoRotina(
  userId: string,
  data: string,
  rotinaId: string,
  situacao: SituacaoItem
): Promise<void> {
  await exigirFaixaValida(userId, rotinaId, data, ["rotina"]);
  const supabase = await createClient();

  if (situacao === "pendente") {
    const { error } = await supabase
      .from("zh_agenda_execucoes")
      .delete()
      .eq("criado_por", userId)
      .eq("data", data)
      .eq("rotina_id", rotinaId);
    if (error) throw erroDeNegocio(error);
    return;
  }

  const { error } = await supabase
    .from("zh_agenda_execucoes")
    .upsert(
      { criado_por: userId, data, rotina_id: rotinaId, situacao },
      { onConflict: "criado_por,data,rotina_id" }
    );

  if (error) throw erroDeNegocio(error);
}
