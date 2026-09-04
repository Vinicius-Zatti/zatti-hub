import { ultimoDiaDoMes } from "@/lib/financeiro-gerencial/datas";
import type { FrenteTempo, LancamentoTempo, LinhaPainelMensalTempo, MetaMensalTempo, TipoTrabalhoTempo, ValorHoraTempo } from "./tipos";

/** Rótulo de negócio de cada tipo de trabalho - usado tanto na tela Hoje
 * quanto no Histórico (função pura/constante neutra, sem I/O, por isso vive
 * aqui em vez de duplicada ou importada de componente pra componente). */
export const TIPO_TRABALHO_LABEL: Record<TipoTrabalhoTempo, string> = {
  reuniao: "Reunião",
  preparacao: "Preparação",
  execucao: "Execução",
  followup: "Follow-up",
  outro: "Outro",
};

/** "125" minutos -> "2h05" - formato pedido pro Painel mensal (soma sempre em
 * minuto exato, só o total exibido é arredondado/formatado). Minutos sempre
 * com 2 dígitos, mesmo padrão de HH:MM. */
export function formatarHorasMinutos(totalMinutos: number): string {
  const minutosArredondados = Math.round(totalMinutos);
  const horas = Math.floor(minutosArredondados / 60);
  const minutos = minutosArredondados % 60;
  return `${horas}h${String(minutos).padStart(2, "0")}`;
}

/** "AAAA-MM" -> "AAAA-MM-DD" do último dia daquele mês - reaproveita
 * `ultimoDiaDoMes` do Financeiro Gerencial (matemática de data genérica, sem
 * relação com o domínio financeiro). */
export function ultimoDiaCompetencia(competencia: string): string {
  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mesIndice0 = Number(mesStr) - 1;
  return `${anoStr}-${mesStr}-${String(ultimoDiaDoMes(ano, mesIndice0)).padStart(2, "0")}`;
}

/** Linha vigente numa data de referência: a de maior `vigenteDesde` que seja
 * <= a referência. Espera a lista já ordenada desc por `vigenteDesde` (mesma
 * ordem que a camada de acesso ao banco já devolve). `null` quando nenhuma
 * linha do histórico ainda valia naquela data. */
export function itemVigenteEm<T extends { vigenteDesde: string }>(
  historicoDesc: T[],
  dataReferenciaIso: string,
): T | null {
  return historicoDesc.find((item) => item.vigenteDesde <= dataReferenciaIso) ?? null;
}

/** "09:00" + "10:30" -> 90 (minutos). "23:00" + "00:24" -> 84 (vira o dia -
 * lançamento manual não tem campo de data separado pro fim, então fim <=
 * início é sempre lido como madrugada do dia seguinte, nunca como entrada
 * inválida). Só um horário exatamente igual ao início dá 0, e quem chama
 * (`resolverTempoManual`) trata isso como erro de validação. */
export function calcularDuracaoMinutosPorHorario(horaInicio: string, horaFim: string): number {
  const [horaI, minutoI] = horaInicio.split(":").map(Number);
  const [horaF, minutoF] = horaFim.split(":").map(Number);
  const minutosInicio = horaI * 60 + minutoI;
  const minutosFim = horaF * 60 + minutoF;
  return minutosFim < minutosInicio ? minutosFim + 24 * 60 - minutosInicio : minutosFim - minutosInicio;
}

export function somarMinutos(lancamentos: { duracaoMinutos: number | null }[]): number {
  return lancamentos.reduce((total, l) => total + (l.duracaoMinutos ?? 0), 0);
}

/** Data (AAAA-MM-DD) no fuso de Brasília a partir de um instante UTC do
 * servidor - usado só pro cronômetro (que nasce de `new Date()` no servidor);
 * lançamento manual usa a data escolhida no `<input type="date">` direto, sem
 * conversão nenhuma. Sem isso, iniciar o cronômetro à noite (Brasília) já
 * depois da meia-noite UTC gravaria o dia seguinte por engano. */
export function dataLocalBrasil(data: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

/** "HH:MM" no fuso de Brasília a partir de um instante UTC do servidor -
 * mesmo motivo de `dataLocalBrasil`, pro par hora_inicio/hora_fim que o
 * cronômetro grava sozinho ao encerrar. */
export function horaLocalBrasil(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(data);
}

/** Segundos corridos entre duas marcas de tempo, sem contar o tanto que ficou
 * pausado no meio - base de `duracao_minutos` ao encerrar um cronômetro. */
export function calcularDuracaoSegundosCronometro(params: {
  iniciadoEm: Date;
  encerradoEm: Date;
  segundosPausadosAcumulados: number;
}): number {
  const totalSegundos = Math.round((params.encerradoEm.getTime() - params.iniciadoEm.getTime()) / 1000);
  return Math.max(0, totalSegundos - params.segundosPausadosAcumulados);
}

/** Monta o Painel mensal: por frente, meta (quando tem)/realizado/restante/%
 * e valor equivalente das horas (só frente paga). Meta em horas é sempre
 * calculada aqui, nunca gravada (`metaValorMensal vigente / valorHora
 * vigente`). Frente própria nunca tem meta/%/valor equivalente - aparece
 * separada, sem parecer cobrança. */
export function montarPainelMensal(params: {
  frentes: FrenteTempo[];
  valoresHoraDesc: ValorHoraTempo[];
  metasMensaisDesc: MetaMensalTempo[];
  lancamentosEncerradosDoMes: LancamentoTempo[];
  competencia: string;
}): LinhaPainelMensalTempo[] {
  const referencia = ultimoDiaCompetencia(params.competencia);
  const valorHoraVigente = itemVigenteEm(params.valoresHoraDesc, referencia)?.valor ?? null;

  const minutosPorFrente = new Map<string, number>();
  for (const lancamento of params.lancamentosEncerradosDoMes) {
    minutosPorFrente.set(lancamento.frenteId, (minutosPorFrente.get(lancamento.frenteId) ?? 0) + (lancamento.duracaoMinutos ?? 0));
  }

  return params.frentes.map((frente) => {
    const realizadoMinutos = minutosPorFrente.get(frente.id) ?? 0;

    if (frente.tipo === "propria") {
      return {
        frente,
        realizadoMinutos,
        metaValorMensal: null,
        metaMinutos: null,
        restanteMinutos: null,
        percentualAtingido: null,
        valorHoraVigente,
        valorEquivalente: null,
      };
    }

    const metasDaFrente = params.metasMensaisDesc.filter((m) => m.frenteId === frente.id);
    const metaValorMensal = itemVigenteEm(metasDaFrente, referencia)?.valorMensal ?? null;
    const metaMinutos = metaValorMensal !== null && valorHoraVigente ? Math.round((metaValorMensal / valorHoraVigente) * 60) : null;
    const restanteMinutos = metaMinutos !== null ? Math.max(0, metaMinutos - realizadoMinutos) : null;
    const percentualAtingido = metaMinutos ? realizadoMinutos / metaMinutos : null;
    const valorEquivalente = valorHoraVigente !== null ? (realizadoMinutos / 60) * valorHoraVigente : null;

    return {
      frente,
      realizadoMinutos,
      metaValorMensal,
      metaMinutos,
      restanteMinutos,
      percentualAtingido,
      valorHoraVigente,
      valorEquivalente,
    };
  });
}
