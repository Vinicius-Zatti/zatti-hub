import { somarValores } from "./parcelas";
import type { BaixaBase, ContaFinanceira, LancamentoBase, TipoLancamento } from "./tipos";

/** Projetado e Realizado nunca se misturam: cada visão monta a própria lista
 * de movimentos e todo saldo/relatório (Fluxo de Caixa, DFC, Visão geral) é
 * calculado em cima de UMA lista só.
 * - Projetado: toda parcela não cancelada, valor cheio, pela data prevista.
 * - Realizado: toda baixa pela data efetiva (estorno subtrai). */
export type VisaoCaixa = "projetado" | "realizado";

/** `valor` com sinal: entrada positiva, saída negativa. */
export type MovimentoCaixa = {
  data: string;
  valor: number;
  tipo: TipoLancamento;
  categoriaId: string;
  contaFinanceiraId: string | null;
  lancamentoId: string;
};

function sinal(tipo: TipoLancamento): 1 | -1 {
  return tipo === "receita" ? 1 : -1;
}

/** `contas` é obrigatório: movimento de uma conta anterior à data do saldo
 * inicial dela já está dentro desse saldo e sai da lista (senão desconta duas
 * vezes). Movimento sem conta financeira fica. */
export function montarMovimentosCaixa(params: {
  visao: VisaoCaixa;
  lancamentos: LancamentoBase[];
  baixas: BaixaBase[];
  contas: ContaFinanceira[];
  contaFinanceiraId?: string | null;
}): MovimentoCaixa[] {
  const { visao, lancamentos, baixas, contas, contaFinanceiraId } = params;
  const movimentos: MovimentoCaixa[] = [];

  if (visao === "projetado") {
    for (const l of lancamentos) {
      for (const p of l.parcelas) {
        if (p.status === "cancelado") continue;
        movimentos.push({
          data: p.dataPrevista,
          valor: sinal(l.tipo) * p.valor,
          tipo: l.tipo,
          categoriaId: l.categoriaId,
          contaFinanceiraId: p.contaFinanceiraId,
          lancamentoId: l.id,
        });
      }
    }
  } else {
    const parcelaParaLancamento = new Map<string, LancamentoBase>();
    for (const l of lancamentos) for (const p of l.parcelas) parcelaParaLancamento.set(p.id, l);
    for (const b of baixas) {
      const l = parcelaParaLancamento.get(b.parcelaId);
      if (!l) continue;
      const valorBaixa = b.tipo === "estorno" ? -b.valor : b.valor;
      movimentos.push({
        data: b.data,
        valor: sinal(l.tipo) * valorBaixa,
        tipo: l.tipo,
        categoriaId: l.categoriaId,
        contaFinanceiraId: b.contaFinanceiraId,
        lancamentoId: l.id,
      });
    }
  }

  const dataInicialPorConta = new Map(contas.map((c) => [c.id, c.dataSaldoInicial]));
  const validos = movimentos.filter((m) => {
    const inicio = m.contaFinanceiraId ? dataInicialPorConta.get(m.contaFinanceiraId) : undefined;
    return !inicio || m.data >= inicio;
  });
  if (!contaFinanceiraId) return validos;
  return validos.filter((m) => m.contaFinanceiraId === contaFinanceiraId);
}

/** Saldo inicial cadastrado de uma conta, valendo a partir do começo do dia
 * `data` (a `data_saldo_inicial` da conta). Antes dessa data a conta não tem
 * saldo nenhum. */
export type AberturaConta = { data: string; valor: number };

export function aberturasDasContas(contas: ContaFinanceira[], contaFinanceiraId?: string | null): AberturaConta[] {
  const alvo = contaFinanceiraId ? contas.filter((c) => c.id === contaFinanceiraId) : contas;
  return alvo.map((c) => ({ data: c.dataSaldoInicial, valor: c.saldoInicial }));
}

function aberturasAte(aberturas: AberturaConta[], data: string): number[] {
  return aberturas.filter((a) => a.data <= data).map((a) => a.valor);
}

/** Saldo no começo do dia `data`: saldos iniciais com data até ela (inclusive,
 * o saldo inicial é o do começo do dia) + movimentos estritamente anteriores. */
export function saldoAntesDe(aberturas: AberturaConta[], movimentos: MovimentoCaixa[], data: string): number {
  return somarValores([...aberturasAte(aberturas, data), ...movimentos.filter((m) => m.data < data).map((m) => m.valor)]);
}

/** Saldo no fim do dia `data` (saldos iniciais e movimentos até a data). */
export function saldoAte(aberturas: AberturaConta[], movimentos: MovimentoCaixa[], data: string): number {
  return somarValores([...aberturasAte(aberturas, data), ...movimentos.filter((m) => m.data <= data).map((m) => m.valor)]);
}

export function competenciaDoMes(ano: number, indiceMes: number): string {
  return `${ano}-${String(indiceMes + 1).padStart(2, "0")}`;
}
