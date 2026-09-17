import type { ItemInventario, Pedido } from "@/lib/types";
import {
  avisoDeContagemParcial,
  situacaoDaData,
  type AndamentoSetor,
} from "@/lib/contagem/setor";

function parseDataBR(data: string): number {
  const [d, m, a] = data.split("/").map(Number);
  if (!d || !m || !a) return 0;
  return new Date(a, m - 1, d).getTime();
}

/** Datas de contagem distintas, mais recente primeiro - alimenta os dois
 * seletores (início/fim de período) da Calculadora de CMV.
 *
 * Data parcial (algum setor ainda não fechou) NUNCA entra: usar meia contagem
 * como estoque inicial ou final produz um CMV errado e crível, que é o pior
 * tipo de erro. Data legada, anterior ao controle de setor, conta como
 * completa - senão o histórico dos clientes antigos sumiria daqui. */
export function datasDeContagem(
  itens: ItemInventario[],
  andamentoPorData: Map<string, AndamentoSetor[]> = new Map(),
): string[] {
  const vistas = new Map<string, number>();
  for (const it of itens) {
    if (!vistas.has(it.data)) vistas.set(it.data, parseDataBR(it.data));
  }
  return Array.from(vistas.entries())
    .filter(([data]) => situacaoDaData(andamentoPorData.get(data) ?? []) !== "parcial")
    .sort((a, b) => b[1] - a[1])
    .map(([data]) => data);
}

/** Datas que ficaram de fora por estarem parciais, com quem falta contar -
 * a tela precisa explicar a ausência em vez de só esconder a data. */
export function datasParciais(
  itens: ItemInventario[],
  andamentoPorData: Map<string, AndamentoSetor[]> = new Map(),
): { data: string; aviso: string }[] {
  const vistas = new Set(itens.map((it) => it.data));
  return Array.from(vistas)
    .filter((data) => situacaoDaData(andamentoPorData.get(data) ?? []) === "parcial")
    .sort((a, b) => parseDataBR(b) - parseDataBR(a))
    .map((data) => ({ data, aviso: avisoDeContagemParcial(andamentoPorData.get(data) ?? []) }));
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
  /** Valor de compras calculado a partir dos pedidos marcados como recebidos
   * no sistema - sempre exposto, mesmo quando `comprasManual` for usado no
   * lugar, pra quem está calculando ver a diferença entre os dois. */
  valorComprasCalculado: number;
  /** Valor de compras efetivamente usado no cálculo: `comprasManual` quando
   * informado, senão `valorComprasCalculado`. */
  valorCompras: number;
  usouComprasManual: boolean;
  custoConsumido: number;
  faturamento: number;
  cmvPercentual: number | null;
};

/** CMV real do período = (estoque inicial + compras do período − estoque
 * final) ÷ faturamento informado. Faturamento não existe no Zatti Hub hoje
 * (é sistema de estoque/compras, não de vendas) - por isso entra sempre por
 * input manual, não é buscado de nenhuma planilha/tabela.
 *
 * Compras: por padrão soma os pedidos marcados como recebidos no sistema
 * (`valorComprasRecebidas`), mas isso só é confiável se o cliente lançou
 * TODA compra do período em Pedidos Feitos. Quando `comprasManual` é
 * informado, ele substitui o valor calculado - cobre o caso real de cliente
 * que ainda compra fora do fluxo do Zatti Hub (fornecedor direto, feira,
 * mercado) e sabe o total gasto de outra forma (nota fiscal, extrato). */
export function calcularCmv(params: {
  itensInventario: ItemInventario[];
  pedidos: Pedido[];
  dataInicial: string;
  dataFinal: string;
  faturamento: number | null;
  comprasManual?: number | null;
}): ResultadoCmv {
  const valorEstoqueInicial = valorContagem(params.itensInventario, params.dataInicial);
  const valorEstoqueFinal = valorContagem(params.itensInventario, params.dataFinal);
  const valorComprasCalculado = valorComprasRecebidas(params.pedidos, params.dataInicial, params.dataFinal);
  const usouComprasManual = params.comprasManual !== null && params.comprasManual !== undefined;
  const valorCompras = usouComprasManual ? (params.comprasManual as number) : valorComprasCalculado;
  const custoConsumido = valorEstoqueInicial + valorCompras - valorEstoqueFinal;
  const faturamento = params.faturamento ?? 0;
  const cmvPercentual = faturamento > 0 ? (custoConsumido / faturamento) * 100 : null;

  return {
    valorEstoqueInicial,
    valorEstoqueFinal,
    valorComprasCalculado,
    valorCompras,
    usouComprasManual,
    custoConsumido,
    faturamento,
    cmvPercentual,
  };
}
