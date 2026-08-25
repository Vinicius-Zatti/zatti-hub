import { ultimoDiaDoMes } from "./datas";

/** Todas as ocorrências nascem de uma vez na criação (sem job/cron nesta
 * fase) - por isso uma recorrência nunca é "pra sempre", sempre termina numa
 * data ou depois de N ocorrências, e nunca gera mais que este teto. */
export const MAXIMO_OCORRENCIAS_RECORRENCIA = 360;

export type FimRecorrencia = { modo: "data"; dataFim: string } | { modo: "quantidade"; quantidadeOcorrencias: number };

/** Mês/ano da 1ª ocorrência: mesmo mês de `dataInicio` se o dia de
 * vencimento (já clampado nesse mês) ainda não passou, senão mês seguinte.
 * Ex: início 15/03, vencimento dia 5 -> 5 já passou em março, 1ª ocorrência
 * é 05/04. Início 01/03, vencimento dia 5 -> 1ª ocorrência é 05/03. */
function primeiroAnoMes(dataInicio: string, diaVencimento: number): { ano: number; mesIndice0: number } {
  const [anoStr, mesStr, diaStr] = dataInicio.split("-");
  const ano = Number(anoStr);
  const mesIndice0 = Number(mesStr) - 1;
  const diaInicio = Number(diaStr);
  const diaClampadoNoMesInicio = Math.min(diaVencimento, ultimoDiaDoMes(ano, mesIndice0));
  if (diaClampadoNoMesInicio >= diaInicio) return { ano, mesIndice0 };

  const proximoMesTotal = mesIndice0 + 1;
  return { ano: ano + Math.floor(proximoMesTotal / 12), mesIndice0: ((proximoMesTotal % 12) + 12) % 12 };
}

/** Data da ocorrência de índice `indice` (0 = primeira) a partir do mês-âncora
 * - sempre clampa o `diaVencimento` original contra o mês de destino, nunca
 * a partir do dia já clampado de uma ocorrência anterior (senão dia 31 cai
 * pra 28 em fevereiro e nunca mais volta a 31 - mesmo cuidado de
 * `somarMesesClampado`, que não dá pra reaproveitar aqui porque ele deriva
 * o dia da própria data de entrada, e aqui o dia de referência é sempre o
 * `diaVencimento` original, não o da ocorrência anterior). */
function dataDaOcorrencia(anoBase: number, mesBase0: number, indice: number, diaVencimento: number): string {
  const total = mesBase0 + indice;
  const ano = anoBase + Math.floor(total / 12);
  const mes0 = ((total % 12) + 12) % 12;
  const dia = Math.min(diaVencimento, ultimoDiaDoMes(ano, mes0));
  return `${String(ano).padStart(4, "0")}-${String(mes0 + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Gera as datas de vencimento (competência = vencimento, 1 lançamento + 1
 * parcela por ocorrência) de uma recorrência mensal. */
export function gerarOcorrenciasRecorrencia(params: {
  diaVencimento: number;
  dataInicio: string;
  fim: FimRecorrencia;
}): string[] {
  const { ano, mesIndice0 } = primeiroAnoMes(params.dataInicio, params.diaVencimento);

  if (params.fim.modo === "quantidade") {
    const quantidade = params.fim.quantidadeOcorrencias;
    if (quantidade < 1) throw new Error("quantidadeOcorrencias deve ser no mínimo 1");
    if (quantidade > MAXIMO_OCORRENCIAS_RECORRENCIA) {
      throw new Error(`Máximo de ${MAXIMO_OCORRENCIAS_RECORRENCIA} ocorrências por recorrência`);
    }
    return Array.from({ length: quantidade }, (_, indice) => dataDaOcorrencia(ano, mesIndice0, indice, params.diaVencimento));
  }

  const datas: string[] = [];
  for (let indice = 0; indice < MAXIMO_OCORRENCIAS_RECORRENCIA; indice++) {
    const data = dataDaOcorrencia(ano, mesIndice0, indice, params.diaVencimento);
    if (data > params.fim.dataFim) break;
    datas.push(data);
  }
  if (datas.length === 0) {
    throw new Error("Data final anterior à primeira ocorrência da recorrência");
  }
  const proxima = dataDaOcorrencia(ano, mesIndice0, MAXIMO_OCORRENCIAS_RECORRENCIA, params.diaVencimento);
  if (datas.length === MAXIMO_OCORRENCIAS_RECORRENCIA && proxima <= params.fim.dataFim) {
    throw new Error(`Máximo de ${MAXIMO_OCORRENCIAS_RECORRENCIA} ocorrências por recorrência - reduza o período`);
  }
  return datas;
}
