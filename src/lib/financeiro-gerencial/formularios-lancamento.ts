import type { FimRecorrencia, ModeloRecorrencia, OcorrenciaRecorrencia } from "./recorrencia";
import type { Lancamento, Recorrencia } from "./tipos";

/** Payloads dos formulários de edição (25/09) em função pura - é o que a tela
 * manda pra Server Action, testado sem navegador pra garantir que o Plano de
 * Contas escolhido chega ao servidor (bug 5: a troca pra INSS não chegou). */

export type EstadoEdicaoLancamento = {
  categoriaId: string;
  descricao: string;
  dataCompetencia: string;
  contaFinanceiraId: string;
  observacao: string;
  parcelas: { id: string; valor: number | null; dataPrevista: string; contaFinanceiraId: string }[];
};

export function entradaEditarLancamento(lancamentoId: string, estado: EstadoEdicaoLancamento) {
  return {
    id: lancamentoId,
    categoriaId: estado.categoriaId,
    descricao: estado.descricao,
    dataCompetencia: estado.dataCompetencia,
    contaFinanceiraId: estado.contaFinanceiraId || null,
    observacao: estado.observacao,
    parcelas: estado.parcelas.map((p) => ({
      id: p.id,
      valor: p.valor ?? 0,
      dataPrevista: p.dataPrevista,
      contaFinanceiraId: p.contaFinanceiraId || null,
    })),
  };
}

export function estadoInicialEdicaoLancamento(lancamento: Lancamento): EstadoEdicaoLancamento {
  return {
    categoriaId: lancamento.categoriaId,
    descricao: lancamento.descricao,
    dataCompetencia: lancamento.dataCompetencia,
    contaFinanceiraId: lancamento.contaFinanceiraId ?? "",
    observacao: lancamento.observacao,
    parcelas: lancamento.parcelas.map((p) => ({ id: p.id, valor: p.valor, dataPrevista: p.dataPrevista, contaFinanceiraId: p.contaFinanceiraId ?? "" })),
  };
}

export type EstadoEdicaoRecorrencia = {
  categoriaId: string;
  descricao: string;
  contaFinanceiraId: string;
  valor: number | null;
  dataCompetencia: string;
  dataPrimeiroVencimento: string;
  modoFim: "quantidade" | "data";
  quantidadeOcorrencias: number;
  dataFim: string;
};

/** Formulário "Editar pagamento recorrente" preenchido com o que existe: o
 * modelo da recorrência + a 1ª ocorrência ativa (competência e data de
 * pagamento de partida) + a conta financeira da 1ª ocorrência ainda em aberto. */
export function estadoInicialEdicaoRecorrencia(recorrencia: Recorrencia, ocorrencias: OcorrenciaRecorrencia[]): EstadoEdicaoRecorrencia {
  const ativas = ocorrencias.filter((o) => o.status !== "cancelado");
  const primeira = ativas[0];
  const primeiraAberta = ativas.find((o) => o.valorBaixado === 0 && o.status === "aberto") ?? primeira;
  return {
    categoriaId: recorrencia.categoriaId,
    descricao: recorrencia.descricao,
    contaFinanceiraId: primeiraAberta?.contaFinanceiraId ?? "",
    valor: recorrencia.valor,
    dataCompetencia: primeira?.competencia ?? recorrencia.dataInicio,
    dataPrimeiroVencimento: primeira?.dataPrevista ?? recorrencia.dataInicio,
    modoFim: recorrencia.dataFim ? "data" : "quantidade",
    quantidadeOcorrencias: recorrencia.quantidadeOcorrencias ?? ativas.length,
    dataFim: recorrencia.dataFim ?? "",
  };
}

export function modeloDaEdicaoRecorrencia(estado: EstadoEdicaoRecorrencia): ModeloRecorrencia {
  const fim: FimRecorrencia =
    estado.modoFim === "data" ? { modo: "data", dataFim: estado.dataFim } : { modo: "quantidade", quantidadeOcorrencias: estado.quantidadeOcorrencias };
  return {
    categoriaId: estado.categoriaId,
    descricao: estado.descricao,
    contaFinanceiraId: estado.contaFinanceiraId || null,
    valor: estado.valor ?? 0,
    dataCompetencia: estado.dataCompetencia,
    dataPrimeiroVencimento: estado.dataPrimeiroVencimento,
    fim,
  };
}

export function entradaEditarRecorrencia(recorrenciaId: string, estado: EstadoEdicaoRecorrencia) {
  return { recorrenciaId, ...modeloDaEdicaoRecorrencia(estado) };
}
