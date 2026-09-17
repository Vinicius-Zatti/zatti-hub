import type {
  CompromissoCalendario,
  ExecucaoRotina,
  RotinaAgenda,
  SituacaoItem,
  TarefaAgenda,
} from "@/lib/agenda/tipos";
import { TETO_PRIORIDADES } from "@/lib/agenda/tipos";
import { parearCalendario } from "@/lib/agenda/sincronizacao";

/** Montagem do dia a partir das três fontes, na ordem da Agenda v2: Agenda,
 * Prioridades, Blocos de execução e Rotinas.
 *
 * Função pura, sem I/O e sem import de servidor - roda igual no componente e
 * no teste. Quem busca os dados é a página. */

export type BlocoDoDia = {
  rotina: RotinaAgenda;
  /** Tarefas e prioridades que vão ser executadas nesse bloco. */
  tarefas: TarefaAgenda[];
  /** Só faixa de trabalho recebe prioridade; família, treino e almoço não. */
  disponivel: boolean;
  /** Evento recorrente do Calendar reconhecido como espelho desta faixa. */
  espelhadoNoCalendar: boolean;
};

export type RotinaDoDia = {
  rotina: RotinaAgenda;
  situacao: SituacaoItem;
  observacao: string;
};

export type DiaMontado = {
  compromissos: CompromissoCalendario[];
  /** Reunião fixa que está escrita na grade. Só vira tela quando o Calendar
   * não pôde ser lido - com Calendar no ar, ele é a fonte do compromisso. */
  compromissosDaGrade: RotinaAgenda[];
  prioridades: TarefaAgenda[];
  tarefasSoltas: TarefaAgenda[];
  linhaDoDia: BlocoDoDia[];
  rotinas: RotinaDoDia[];
  alertas: string[];
  /** Compromisso do Calendar em cima de faixa da grade ou de outro
   * compromisso. Aviso simples: nada é ajustado. */
  sobreposicoes: string[];
};

export type EntradaDoDia = {
  /** Só as faixas ativas do dia da semana. */
  rotinas: RotinaAgenda[];
  tarefas: TarefaAgenda[];
  execucoes: ExecucaoRotina[];
  /** null = não deu para ler o Calendar; a tela mostra o motivo separado. */
  compromissos: CompromissoCalendario[] | null;
};

export function montarDia({ rotinas, tarefas, execucoes, compromissos }: EntradaDoDia): DiaMontado {
  const pareamento = compromissos === null ? null : parearCalendario(rotinas, compromissos);

  const porRotina = new Map<string, TarefaAgenda[]>();
  for (const tarefa of tarefas) {
    if (!tarefa.rotinaId) continue;
    const lista = porRotina.get(tarefa.rotinaId) ?? [];
    lista.push(tarefa);
    porRotina.set(tarefa.rotinaId, lista);
  }

  const situacaoPorRotina = new Map(execucoes.map((e) => [e.rotinaId, e]));

  const linhaDoDia: BlocoDoDia[] = rotinas.map((rotina) => ({
    rotina,
    tarefas: porRotina.get(rotina.id) ?? [],
    disponivel: rotina.tipo === "bloco",
    espelhadoNoCalendar: pareamento?.espelhoPorRotina.has(rotina.id) ?? false,
  }));

  const prioridades = tarefas.filter((t) => t.prioridade);
  const tarefasSoltas = tarefas.filter((t) => !t.prioridade);

  const alertas: string[] = [];

  for (const prioridade of prioridades) {
    if (!prioridade.rotinaId) {
      alertas.push(`"${prioridade.titulo}" é prioridade do dia e ainda não tem bloco de execução.`);
    }
  }

  // O banco só deixa a tarefa apontar para faixa do mesmo dia da semana. Se o
  // id não está entre as faixas ativas do dia, a faixa saiu da grade: a
  // tarefa foi preservada e precisa de outro bloco.
  const idsAtivos = new Set(rotinas.map((rotina) => rotina.id));
  for (const tarefa of tarefas) {
    if (tarefa.rotinaId && !idsAtivos.has(tarefa.rotinaId)) {
      alertas.push(`"${tarefa.titulo}" estava num bloco que saiu da agenda semanal. Escolha outro bloco.`);
    }
  }

  for (const bloco of linhaDoDia) {
    if (bloco.disponivel || bloco.tarefas.length === 0) continue;
    const titulos = bloco.tarefas.map((t) => `"${t.titulo}"`).join(", ");
    alertas.push(`${titulos} está marcada em ${bloco.rotina.rotulo}, que não é horário de trabalho.`);
  }

  if (prioridades.length > TETO_PRIORIDADES) {
    alertas.push(`O dia está com ${prioridades.length} prioridades. O teto é ${TETO_PRIORIDADES}.`);
  }

  return {
    compromissos: pareamento?.compromissos ?? [],
    compromissosDaGrade: pareamento === null ? rotinas.filter((r) => r.tipo === "compromisso") : [],
    prioridades,
    tarefasSoltas,
    linhaDoDia,
    rotinas: rotinas
      .filter((r) => r.tipo === "rotina")
      .map((rotina) => {
        const execucao = situacaoPorRotina.get(rotina.id);
        return {
          rotina,
          situacao: execucao?.situacao ?? ("pendente" as SituacaoItem),
          observacao: execucao?.observacao ?? "",
        };
      }),
    alertas,
    sobreposicoes: pareamento?.sobreposicoes ?? [],
  };
}

/** Blocos livres para receber uma prioridade, na ordem do dia - é o que o
 * formulário de tarefa oferece no campo "executar em". */
export function blocosDisponiveis(rotinas: RotinaAgenda[]): RotinaAgenda[] {
  return rotinas.filter((r) => r.tipo === "bloco");
}
