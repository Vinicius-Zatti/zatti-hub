import { somarMesesClampado, ultimoDiaDoMes } from "./datas";

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

/** Competência de cada ocorrência (pedido de Vinícius em 25/09): parte da
 * competência informada e avança um mês por ocorrência, independente do dia
 * de vencimento. Sem competência informada, vale o vencimento (regra antiga). */
export function gerarCompetenciasRecorrencia(vencimentos: string[], dataCompetencia?: string): string[] {
  if (!dataCompetencia) return vencimentos;
  return vencimentos.map((_, indice) => somarMesesClampado(dataCompetencia, indice));
}

/** Gera as datas de vencimento (1 lançamento + 1 parcela por ocorrência) de
 * uma recorrência mensal - a competência sai de `gerarCompetenciasRecorrencia`. */
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

// ── Editar pagamento recorrente (redesenho de 25/09) ──────────────────────

/** Uma ocorrência já gerada (1 lançamento + 1 parcela). */
export type OcorrenciaRecorrencia = {
  lancamentoId: string;
  parcelaId: string;
  competencia: string;
  dataPrevista: string;
  valor: number;
  categoriaId: string;
  descricao: string;
  contaFinanceiraId: string | null;
  status: "aberto" | "parcial" | "quitado" | "cancelado";
  valorBaixado: number;
};

export type ModeloRecorrencia = {
  categoriaId: string;
  descricao: string;
  contaFinanceiraId: string | null;
  valor: number;
  /** Data de Competência da 1ª ocorrência. */
  dataCompetencia: string;
  /** Data de Pagamento/Recebimento da 1ª ocorrência (o dia vira o dia de vencimento). */
  dataPrimeiroVencimento: string;
  fim: FimRecorrencia;
};

export type PlanoEdicaoRecorrencia = {
  atualizar: { lancamentoId: string; parcelaId: string; competencia: string; dataPrevista: string }[];
  criar: { competencia: string; dataPrevista: string }[];
  cancelar: { lancamentoId: string; parcelaId: string }[];
  /** Ocorrência paga/recebida que a nova regra alteraria - fica como está. */
  conflitos: { lancamentoId: string; competencia: string; dataPrevista: string; motivo: string }[];
};

export function ocorrenciaTemBaixa(o: OcorrenciaRecorrencia): boolean {
  return o.valorBaixado !== 0 || o.status === "parcial" || o.status === "quitado";
}

/** Plano de reescrita da recorrência inteira a partir do novo modelo - função
 * pura, a mesma conta roda na tela (pra avisar conflito antes de salvar) e no
 * servidor (pra gravar). Posição i do calendário novo casa com a i-ésima
 * ocorrência existente (ordem de competência, canceladas fora):
 * - sem baixa: recebe o modelo novo inteiro (datas, valor, conta, descrição);
 * - com baixa: nunca muda; se a regra nova pedir outra coisa, vira conflito;
 * - sobrando no fim (nova quantidade menor): sem baixa = cancelamento lógico,
 *   com baixa = fica e vira conflito;
 * - faltando (nova quantidade maior): cria as ocorrências novas. */
export function planejarEdicaoRecorrencia(ocorrencias: OcorrenciaRecorrencia[], modelo: ModeloRecorrencia): PlanoEdicaoRecorrencia {
  const dia = Number(modelo.dataPrimeiroVencimento.slice(8, 10));
  const vencimentos = gerarOcorrenciasRecorrencia({ diaVencimento: dia, dataInicio: modelo.dataPrimeiroVencimento, fim: modelo.fim });
  const competencias = gerarCompetenciasRecorrencia(vencimentos, modelo.dataCompetencia);
  const ativas = ocorrencias.filter((o) => o.status !== "cancelado").sort((a, b) => a.competencia.localeCompare(b.competencia) || a.dataPrevista.localeCompare(b.dataPrevista));

  const plano: PlanoEdicaoRecorrencia = { atualizar: [], criar: [], cancelar: [], conflitos: [] };
  const total = Math.max(ativas.length, vencimentos.length);
  for (let i = 0; i < total; i++) {
    const existente = ativas[i];
    const novaData = vencimentos[i];
    const novaCompetencia = competencias[i];
    if (!existente) {
      plano.criar.push({ competencia: novaCompetencia, dataPrevista: novaData });
      continue;
    }
    if (novaData === undefined) {
      if (ocorrenciaTemBaixa(existente)) {
        plano.conflitos.push({ ...chave(existente), motivo: "passa da nova quantidade de parcelas, mas já tem pagamento/recebimento - continua valendo" });
      } else {
        plano.cancelar.push({ lancamentoId: existente.lancamentoId, parcelaId: existente.parcelaId });
      }
      continue;
    }
    if (!ocorrenciaTemBaixa(existente)) {
      plano.atualizar.push({ lancamentoId: existente.lancamentoId, parcelaId: existente.parcelaId, competencia: novaCompetencia, dataPrevista: novaData });
      continue;
    }
    const diferencas = [
      existente.competencia !== novaCompetencia ? "competência" : null,
      existente.dataPrevista !== novaData ? "data de pagamento" : null,
      existente.valor !== modelo.valor ? "valor" : null,
      existente.categoriaId !== modelo.categoriaId ? "plano de contas" : null,
      existente.descricao !== modelo.descricao ? "descrição" : null,
      (existente.contaFinanceiraId ?? null) !== (modelo.contaFinanceiraId ?? null) ? "conta financeira" : null,
    ].filter((d): d is string => d !== null);
    if (diferencas.length > 0) {
      plano.conflitos.push({ ...chave(existente), motivo: `já tem pagamento/recebimento, então ${diferencas.join(", ")} não muda nela` });
    }
  }
  return plano;
}

function chave(o: OcorrenciaRecorrencia) {
  return { lancamentoId: o.lancamentoId, competencia: o.competencia, dataPrevista: o.dataPrevista };
}
