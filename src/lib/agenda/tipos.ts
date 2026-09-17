/** Tipos do módulo pessoal "Agenda". As três fontes do dia são separadas de
 * propósito (decisão de 15/09/2026, ver a migração `agenda_fundamentos`):
 * rotina permanente vem da grade do Cérebro do Gestor, compromisso vem do
 * Google Calendar e tarefa é digitada aqui no app. */

// `TipoRotina` mora em `grade.ts` (arquivo sem import nenhum, porque o script
// de publicação o carrega direto no Node) e é reexportado aqui para o resto do
// módulo continuar importando tudo de um lugar só.
import type { TipoRotina } from "@/lib/agenda/grade";
export type { TipoRotina };

export type SituacaoItem = "pendente" | "feita" | "nao_feita" | "adiada";

/** Uma faixa de horário da grade semanal, como publicada do
 * `_conhecimento/agenda-semanal.md`. */
export type RotinaAgenda = {
  id: string;
  /** 0 = domingo ... 6 = sábado (mesmo padrão de `extract(dow)`). */
  diaSemana: number;
  /** O `agenda-id` escrito na grade: identidade permanente da faixa entre
   * publicações. Não muda com horário, ordem nem texto. */
  chave: string;
  /** Só ordenação de exibição. Nunca serve de identidade. */
  ordem: number;
  /** "09:00" ou null quando a grade não dá hora exata ("até 8h"). */
  horaInicio: string | null;
  horaFim: string | null;
  /** Texto original da coluna Horário ("9h-10h", "até 8h", "21h30+"). */
  horarioTexto: string;
  rotulo: string;
  tipo: TipoRotina;
};

/** Tarefa ou prioridade digitada no app para uma data. */
export type TarefaAgenda = {
  id: string;
  data: string;
  titulo: string;
  detalhe: string;
  prioridade: boolean;
  /** 1 a 4 quando é prioridade, null quando não é. É a posição que o índice
   * único parcial do banco reserva - o teto de prioridades por dia. */
  prioridadePosicao: number | null;
  ordem: number;
  situacao: SituacaoItem;
  /** Bloco da grade onde essa prioridade vai ser executada. */
  rotinaId: string | null;
};

/** Marcação de uma rotina da grade num dia específico. Rotina sem marcação
 * nenhuma é tratada como 'pendente' (não existe linha no banco). */
export type ExecucaoRotina = {
  rotinaId: string;
  situacao: Exclude<SituacaoItem, "pendente">;
  observacao: string;
};

/** Evento datado lido do Google Calendar. */
export type CompromissoCalendario = {
  id: string;
  titulo: string;
  /** "09:30" - null em evento de dia inteiro. */
  horaInicio: string | null;
  horaFim: string | null;
  diaInteiro: boolean;
  /** Instância de série recorrente do Calendar. É o sinal que separa o
   * espelho da rotina da grade de um compromisso - ver `parearCalendario` em
   * `sincronizacao.ts`. */
  recorrente: boolean;
};

/** Resultado da leitura do Calendar: ou os eventos, ou o motivo de não ter
 * conseguido ler. A tela nunca some com a seção Agenda em silêncio. */
export type LeituraCalendario =
  | { ok: true; eventos: CompromissoCalendario[] }
  | { ok: false; motivo: string };

export const TETO_PRIORIDADES = 4;
