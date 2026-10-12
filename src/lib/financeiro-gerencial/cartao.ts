// Cartão de crédito (Financeiro V2, F3): regras puras usadas no servidor e na tela.
// A fatura certa de cada compra é decidida pelo gatilho `atribuir_fatura_cartao` no banco;
// `referenciaFatura` só espelha a regra para destacar a fatura atual na tela.
import { ultimoDiaDoMes } from "./datas";
import type { ContaFinanceira, StatusParcela } from "./tipos";

export type SituacaoFatura = "aberta" | "fechada" | "paga" | "vencida";

export const ROTULO_SITUACAO_FATURA: Record<SituacaoFatura, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  paga: "Paga",
  vencida: "Vencida",
};

export type ItemFatura = {
  parcelaId: string;
  lancamentoId: string;
  /** Data da compra = data de competência do lançamento (é a que vale na DRE). */
  dataCompra: string;
  descricao: string;
  planoDeContas: string;
  numero: number;
  totalParcelas: number;
  valor: number;
  pago: number;
  status: StatusParcela;
};

export type PagamentoFatura = {
  id: string;
  contaFinanceiraId: string;
  valor: number;
  data: string;
};

export type Fatura = {
  id: string;
  contaCartaoId: string;
  /** Dia 1 do mês de fechamento (AAAA-MM-01). */
  referencia: string;
  fechamento: string;
  vencimento: string;
  total: number;
  pago: number;
  saldo: number;
  situacao: SituacaoFatura;
  itens: ItemFatura[];
  pagamentos: PagamentoFatura[];
};

function centavos(v: number): number {
  return Math.round(v * 100);
}

/** Total (parcelas não canceladas), pago (baixas menos estornos) e saldo em aberto. */
export function totaisFatura(itens: { valor: number; pago: number; status: StatusParcela }[]): {
  total: number;
  pago: number;
  saldo: number;
} {
  let total = 0;
  let pago = 0;
  let saldo = 0;
  for (const i of itens) {
    if (i.status === "cancelado") continue;
    const v = centavos(i.valor);
    const p = Math.min(Math.max(0, centavos(i.pago)), v);
    total += v;
    pago += p;
    saldo += v - p;
  }
  return { total: total / 100, pago: pago / 100, saldo: saldo / 100 };
}

/** Aberta até o dia do fechamento; depois, fechada com saldo até o vencimento e vencida após ele.
 * Saldo zero com compras = paga. Datas sempre AAAA-MM-DD (comparação de texto). */
export function situacaoFatura(
  fatura: { fechamento: string; vencimento: string; total: number; saldo: number },
  hoje: string,
): SituacaoFatura {
  const temSaldo = centavos(fatura.saldo) > 0;
  if (!temSaldo && centavos(fatura.total) > 0) return "paga";
  if (hoje <= fatura.fechamento) return "aberta";
  if (!temSaldo) return "paga";
  if (hoje <= fatura.vencimento) return "fechada";
  return "vencida";
}

/** Espelha `fin_referencia_fatura`: compra até o dia do fechamento cai na fatura do mês;
 * depois dele, na do mês seguinte. Dia 31 em mês curto vira o último dia do mês. */
export function referenciaFatura(dataCompra: string, diaFechamento: number): string {
  const [ano, mes, dia] = dataCompra.split("-").map(Number);
  const fechamento = Math.min(diaFechamento, ultimoDiaDoMes(ano, mes - 1));
  const mesRef = dia <= fechamento ? mes : mes + 1;
  const anoFinal = mesRef > 12 ? ano + 1 : ano;
  const mesFinal = mesRef > 12 ? 1 : mesRef;
  return `${String(anoFinal).padStart(4, "0")}-${String(mesFinal).padStart(2, "0")}-01`;
}

/** "2026-10-01" -> "10/2026". */
export function formatarReferencia(referencia: string): string {
  const [ano, mes] = referencia.split("-");
  return `${mes}/${ano}`;
}

/** Contas que podem pagar algo (baixa, pagamento de fatura): nunca o próprio cartão. */
export function contasQuePagam<T extends Pick<ContaFinanceira, "tipo">>(contas: T[]): T[] {
  return contas.filter((c) => c.tipo !== "cartao_credito");
}

export const EXPLICACAO_FATURA_CARTAO =
  "A compra entra na fatura do mês se foi feita até o dia de fechamento; depois disso, na fatura do mês seguinte. " +
  "Compra parcelada: a parcela 2 vai para a fatura seguinte, a 3 para a outra, e assim por diante. " +
  "O vencimento fica no mesmo mês do fechamento quando o dia de vencimento é maior que o de fechamento; senão, no mês seguinte.";
