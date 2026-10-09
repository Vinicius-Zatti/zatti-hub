import type { AjusteDoDia, CompromissoCalendario, RotinaAgenda } from "@/lib/agenda/tipos";

/** Confronto entre o Google Calendar e a grade semanal publicada - versão 1.
 *
 * As duas fontes se sobrepõem de propósito: a regra da Agenda v2 diz que o
 * Calendar espelha a programação recorrente. Sem confronto, natação, almoço e
 * Horizzon apareceriam duas vezes na tela - uma como rotina da grade, outra
 * como compromisso do Calendar.
 *
 * Esconder alguma coisa do Calendar é o defeito mais caro aqui, então o
 * espelho exige três coisas juntas: ser série recorrente, bater o horário da
 * faixa E falar da mesma atividade. Só o horário não basta - uma reunião
 * recorrente marcada em cima do bloco de Horizzon é reunião, não é o Horizzon.
 *
 *   evento recorrente que casa em horário E em atividade com faixa de
 *   trabalho, rotina ou pessoal
 *     -> é o espelho daquela faixa. Sai da seção Agenda (já aparece na linha
 *        do dia);
 *   todo o resto (reunião recorrente, série que a grade não conhece, evento
 *   esporádico) -> compromisso, sempre visível. Nunca é escondido.
 *
 * Se um compromisso se sobrepõe a uma faixa ou a outro compromisso, a tela
 * mostra um aviso simples. Nada é ajustado, nem no Calendar nem na grade.
 *
 * Etapa 2 (09/10/2026): ajuste do dia. O Calendar é onde o ajuste fica
 * gravado - a Agenda move ou encolhe a ocorrência daquele dia, e o app lê.
 * Ocorrência de série que a grade previa no horário da faixa (pelo
 * `horaOriginal`), da mesma atividade, mas que naquele dia está em outro
 * horário, vira ajuste do dia da faixa. Caso real de 30/09/2026: natação
 * movida de 11h45 para 8h15. A grade e o `agenda-id` não mudam.
 *
 * Continua fora: divergência permanente entre série e grade e painel de
 * sincronização. */

export type PareamentoCalendario = {
  /** O que a seção Agenda mostra. */
  compromissos: CompromissoCalendario[];
  /** Evento recorrente reconhecido como espelho de uma faixa, por id da faixa. */
  espelhoPorRotina: Map<string, CompromissoCalendario>;
  /** Horário real do dia da faixa, por id da faixa, quando a ocorrência foi
   * movida ou encolhida no Calendar. */
  ajustePorRotina: Map<string, AjusteDoDia>;
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

/** Palavras que aparecem em título de quase tudo e não identificam atividade
 * nenhuma. Sem esta lista, "Reunião Adega" casaria com "Reunião LK". */
const PALAVRAS_GENERICAS = new Set(["reuniao", "horario", "zatti", "fixo", "semana", "bloco", "sobre"]);

function palavrasDaAtividade(texto: string): Set<string> {
  return new Set(
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((palavra) => palavra.length >= 4 && !PALAVRAS_GENERICAS.has(palavra))
  );
}

/** Uma palavra de peso em comum entre o título do evento e o rótulo da faixa
 * ("Horário de almoço" x "Almoço família (30min)"). Enquanto o Calendar não
 * carregar o `agenda-id` da faixa, é a identidade possível - e o critério erra
 * para o lado de mostrar o evento, nunca para o de escondê-lo. */
function mesmaAtividade(evento: CompromissoCalendario, rotina: RotinaAgenda): boolean {
  const doEvento = palavrasDaAtividade(evento.titulo);
  for (const palavra of palavrasDaAtividade(rotina.rotulo)) {
    if (doEvento.has(palavra)) return true;
  }
  return false;
}

type Intervalo = { horaInicio: string | null; horaFim: string | null };

function seSobrepoem(a: Intervalo, b: Intervalo): boolean {
  if (!a.horaInicio || !a.horaFim || !b.horaInicio || !b.horaFim) return false;
  // "HH:MM" com zero à esquerda compara certo como texto.
  return a.horaInicio < b.horaFim && b.horaInicio < a.horaFim;
}

/** A série previa esta ocorrência no início da faixa e é a mesma atividade,
 * mas hoje ela está em outro horário. Sem `horaOriginal` não há como saber
 * de onde veio, e o evento segue como compromisso visível. */
function ocorrenciaAjustada(evento: CompromissoCalendario, rotina: RotinaAgenda): boolean {
  // Ocorrência virada em dia inteiro não tem horário do dia para mostrar:
  // absorver sumiria com ela. Fica como compromisso.
  if (evento.diaInteiro || !evento.horaInicio || !evento.horaOriginal || !rotina.horaInicio) return false;
  return evento.horaOriginal === rotina.horaInicio && mesmaAtividade(evento, rotina);
}

function descrever(evento: CompromissoCalendario): string {
  return `"${evento.titulo}" (${evento.horaInicio}-${evento.horaFim})`;
}

export function parearCalendario(rotinas: RotinaAgenda[], eventos: CompromissoCalendario[]): PareamentoCalendario {
  const compromissos: CompromissoCalendario[] = [];
  const espelhoPorRotina = new Map<string, CompromissoCalendario>();
  const ajustePorRotina = new Map<string, AjusteDoDia>();
  const sobreposicoes: string[] = [];

  for (const evento of eventos) {
    if (evento.recorrente && !evento.deOutroDia) {
      const candidatas = rotinas.filter((rotina) => rotina.tipo !== "compromisso" && !espelhoPorRotina.has(rotina.id));
      // O horário original identifica a faixa melhor que o atual: com duas
      // faixas da mesma atividade, a movida não pode virar espelho da outra.
      const deOrigem = candidatas.find((rotina) => ocorrenciaAjustada(evento, rotina));
      if (deOrigem) {
        espelhoPorRotina.set(deOrigem.id, evento);
        if (!mesmoHorario(evento, deOrigem)) {
          ajustePorRotina.set(deOrigem.id, { horaInicio: evento.horaInicio, horaFim: evento.horaFim });
        }
        continue;
      }
      const faixa = candidatas.find((rotina) => mesmoHorario(evento, rotina) && mesmaAtividade(evento, rotina));
      if (faixa) {
        espelhoPorRotina.set(faixa.id, evento);
        continue;
      }
    }
    compromissos.push(evento);
  }

  // Reunião fixa da grade fica fora da comparação: com o Calendar no ar, a
  // reunião do dia é o próprio evento, e ela seria avisada contra ela mesma.
  // Faixa ajustada entra com o horário do dia, não o da grade.
  const faixasComparaveis = rotinas
    .filter((rotina) => rotina.tipo !== "compromisso")
    .map((rotina) => ({ ...rotina, ...ajustePorRotina.get(rotina.id) }));

  // Faixa movida para cima de outra faixa também merece aviso: é o que a
  // grade sozinha não mostraria (natação às 8h15 encostando no Horizzon).
  for (const movida of faixasComparaveis.filter((rotina) => ajustePorRotina.has(rotina.id))) {
    const outras = faixasComparaveis
      .filter((outra) => outra.id !== movida.id && seSobrepoem(movida, outra))
      .filter((outra) => !ajustePorRotina.has(outra.id) || outra.id > movida.id)
      .map((outra) => outra.rotulo);
    if (outras.length > 0) {
      sobreposicoes.push(
        `${movida.rotulo} foi para ${movida.horaInicio}-${movida.horaFim} hoje e se sobrepõe a ${outras.join(", ")}.`
      );
    }
  }

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

  return { compromissos, espelhoPorRotina, ajustePorRotina, sobreposicoes };
}
