import type { ItemInventario, Pedido } from "@/lib/types";

function parseDataBR(data: string): number {
  const [d, m, a] = data.split("/").map(Number);
  if (!d || !m || !a) return 0;
  return new Date(a, m - 1, d).getTime();
}

/** Datas de contagem distintas, mais recente primeiro - alimenta os dois
 * seletores (início/fim de período) da Calculadora de CMV. */
export function datasDeContagem(itens: ItemInventario[]): string[] {
  const vistas = new Map<string, number>();
  for (const it of itens) {
    if (!vistas.has(it.data)) vistas.set(it.data, parseDataBR(it.data));
  }
  return Array.from(vistas.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([data]) => data);
}

/** Soma do valor (quantidade × preço) de todos os itens de uma contagem
 * específica - mesmo cálculo que já aparece em Contagem > Visualização. */
export function valorContagem(itens: ItemInventario[], data: string): number {
  return itens.filter((it) => it.data === data).reduce((soma, it) => soma + (it.total ?? 0), 0);
}

/** Valor das compras marcadas como recebidas dentro do período (inclusive).
 * Usa `atualizadoEm` como data de referência do recebimento - o schema não
 * guarda uma "data de recebimento" própria, e `atualizadoEm` é tocado
 * exatamente quando `atualizarRecebimento` marca o pedido como recebido. */
export function valorComprasRecebidas(pedidos: Pedido[], dataInicial: string, dataFinal: string): number {
  const inicioTs = parseDataBR(dataInicial);
  const fimTs = parseDataBR(dataFinal) + 24 * 60 * 60 * 1000 - 1;

  return pedidos
    .filter((p) => p.recebido)
    .filter((p) => {
      const ts = new Date(p.atualizadoEm).getTime();
      return ts >= inicioTs && ts <= fimTs;
    })
    .reduce((soma, p) => {
      const totalPedido = p.itens.reduce((s, it) => {
        const preco = it.precoAtualizado ?? it.precoAntigo ?? 0;
        const qtd = it.quantidadeRecebida ?? it.quantidadePedida;
        return s + preco * qtd;
      }, 0);
      return soma + totalPedido;
    }, 0);
}

export type ResultadoCmv = {
  valorEstoqueInicial: number;
  valorEstoqueFinal: number;
  valorCompras: number;
  custoConsumido: number;
  faturamento: number;
  cmvPercentual: number | null;
};

/** CMV real do período = (estoque inicial + compras recebidas − estoque
 * final) ÷ faturamento informado. Faturamento não existe no Zatti Hub hoje
 * (é sistema de estoque/compras, não de vendas) - por isso entra sempre por
 * input manual, não é buscado de nenhuma planilha/tabela. */
export function calcularCmv(params: {
  itensInventario: ItemInventario[];
  pedidos: Pedido[];
  dataInicial: string;
  dataFinal: string;
  faturamento: number | null;
}): ResultadoCmv {
  const valorEstoqueInicial = valorContagem(params.itensInventario, params.dataInicial);
  const valorEstoqueFinal = valorContagem(params.itensInventario, params.dataFinal);
  const valorCompras = valorComprasRecebidas(params.pedidos, params.dataInicial, params.dataFinal);
  const custoConsumido = valorEstoqueInicial + valorCompras - valorEstoqueFinal;
  const faturamento = params.faturamento ?? 0;
  const cmvPercentual = faturamento > 0 ? (custoConsumido / faturamento) * 100 : null;

  return { valorEstoqueInicial, valorEstoqueFinal, valorCompras, custoConsumido, faturamento, cmvPercentual };
}
