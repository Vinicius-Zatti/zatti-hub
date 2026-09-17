import type { CompromissoCalendario, RotinaAgenda } from "@/lib/agenda/tipos";

/** Confronto entre o Google Calendar e a grade semanal publicada - versão 1.
 *
 * As duas fontes se sobrepõem de propósito: a regra da Agenda v2 diz que o
 * Calendar espelha a programação recorrente. Sem confronto, natação, almoço e
 * Horizzon apareceriam duas vezes na tela - uma como rotina da grade, outra
 * como compromisso do Calendar.
 *
 * O critério é o par horário + recorrência, nunca o texto do título:
 *
 *   evento recorrente que casa com faixa de trabalho, rotina ou pessoal
 *     -> é o espelho daquela faixa. Sai da seção Agenda (já aparece na linha
 *        do dia);
 *   todo o resto (reunião recorrente, série que a grade não conhece, evento
 *   esporádico) -> compromisso, sempre visível. Nunca é escondido.
 *
 * Se um compromisso se sobrepõe a uma faixa ou a outro compromisso, a tela
 * mostra um aviso simples. Nada é ajustado, nem no Calendar nem na grade.
 *
 * Fica para a etapa 2, de propósito: divergência entre série e grade,
 * ocorrência recorrente movida, encolhimento parcial de bloco e painel de
 * sincronização. A v1 gerava falso positivo nesses casos. */

export type PareamentoCalendario = {
  /** O que a seção Agenda mostra. */
  compromissos: CompromissoCalendario[];
  /** Evento recorrente reconhecido como espelho de uma faixa, por id da faixa. */
  espelhoPorRotina: Map<string, CompromissoCalendario>;
  /** Aviso informativo de horário sobreposto. Não pede nem aplica ajuste. */
  sobreposicoes: string[];
};

function mesmoHorario(evento: CompromissoCalendario, rotina: RotinaAgenda): boolean {
  if (!evento.horaInicio || !rotina.horaInicio) return false;
  if (evento.horaInicio !== rotina.horaInicio) return false;
  // Fim só conta quando os dois lados têm. Faixa aberta ("21h30+") casa pelo
  // início, senão nenhuma série de Construção casaria nunca.
  if (evento.horaFim && rotina.horaFim) return evento.horaFim === rotina.horaFim;
  return true;
}

type Intervalo = { horaInicio: string | null; horaFim: string | null };

function seSobrepoem(a: Intervalo, b: Intervalo): boolean {
  if (!a.horaInicio || !a.horaFim || !b.horaInicio || !b.horaFim) return false;
  // "HH:MM" com zero à esquerda compara certo como texto.
  return a.horaInicio < b.horaFim && b.horaInicio < a.horaFim;
}

function descrever(evento: CompromissoCalendario): string {
  return `"${evento.titulo}" (${evento.horaInicio}-${evento.horaFim})`;
}

export function parearCalendario(rotinas: RotinaAgenda[], eventos: CompromissoCalendario[]): PareamentoCalendario {
  const compromissos: CompromissoCalendario[] = [];
  const espelhoPorRotina = new Map<string, CompromissoCalendario>();
  const sobreposicoes: string[] = [];

  for (const evento of eventos) {
    if (evento.recorrente) {
      const faixa = rotinas.find((rotina) => mesmoHorario(evento, rotina));
      if (faixa && faixa.tipo !== "compromisso") {
        espelhoPorRotina.set(faixa.id, evento);
        continue;
      }
    }
    compromissos.push(evento);
  }

  // Reunião fixa da grade fica fora da comparação: com o Calendar no ar, a
  // reunião do dia é o próprio evento, e ela seria avisada contra ela mesma.
  const faixasComparaveis = rotinas.filter((rotina) => rotina.tipo !== "compromisso");

  compromissos.forEach((evento, indice) => {
    const faixas = faixasComparaveis.filter((rotina) => seSobrepoem(evento, rotina)).map((rotina) => rotina.rotulo);
    if (faixas.length > 0) {
      sobreposicoes.push(`${descrever(evento)} se sobrepõe a ${faixas.join(", ")}.`);
    }

    for (const outro of compromissos.slice(indice + 1)) {
      if (seSobrepoem(evento, outro)) {
        sobreposicoes.push(`${descrever(evento)} e ${descrever(outro)} se sobrepõem.`);
      }
    }
  });

  return { compromissos, espelhoPorRotina, sobreposicoes };
}
