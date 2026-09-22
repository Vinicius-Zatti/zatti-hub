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

export function montarMovimentosCaixa(params: {
  visao: VisaoCaixa;
  lancamentos: LancamentoBase[];
  baixas: BaixaBase[];
  contaFinanceiraId?: string | null;
}): MovimentoCaixa[] {
  const { visao, lancamentos, baixas, contaFinanceiraId } = params;
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

  if (!contaFinanceiraId) return movimentos;
  return movimentos.filter((m) => m.contaFinanceiraId === contaFinanceiraId);
}

/** Soma do saldo inicial cadastrado das contas (todas ou só a filtrada). */
export function saldoInicialContas(contas: ContaFinanceira[], contaFinanceiraId?: string | null): number {
  const alvo = contaFinanceiraId ? contas.filter((c) => c.id === contaFinanceiraId) : contas;
  return somarValores(alvo.map((c) => c.saldoInicial));
}

/** Saldo no começo do dia `data` (movimentos estritamente anteriores). */
export function saldoAntesDe(saldoBase: number, movimentos: MovimentoCaixa[], data: string): number {
  return somarValores([saldoBase, ...movimentos.filter((m) => m.data < data).map((m) => m.valor)]);
}

/** Saldo no fim do dia `data` (movimentos até e inclusive a data). */
export function saldoAte(saldoBase: number, movimentos: MovimentoCaixa[], data: string): number {
  return somarValores([saldoBase, ...movimentos.filter((m) => m.data <= data).map((m) => m.valor)]);
}

export function competenciaDoMes(ano: number, indiceMes: number): string {
  return `${ano}-${String(indiceMes + 1).padStart(2, "0")}`;
}
