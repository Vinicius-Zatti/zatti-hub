import type { ItemInventario, Pedido } from "@/lib/types";
import {
  avisoDeContagemParcial,
  situacaoDaData,
  type AndamentoSetor,
  type ModalidadeContagem,
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
  modalidadePorData: Map<string, ModalidadeContagem> = new Map(),
): string[] {
  const vistas = new Map<string, number>();
  for (const it of itens) {
    if (!vistas.has(it.data)) vistas.set(it.data, parseDataBR(it.data));
  }
  return Array.from(vistas.entries())
    .filter(([data]) => motivoInelegivel(data, itens, andamentoPorData, modalidadePorData) === null)
    .sort((a, b) => b[1] - a[1])
    .map(([data]) => data);
}

/** Datas que ficaram de fora por estarem parciais, com quem falta contar -
 * a tela precisa explicar a ausência em vez de só esconder a data. */
export function datasParciais(
  itens: ItemInventario[],
  andamentoPorData: Map<string, AndamentoSetor[]> = new Map(),
  modalidadePorData: Map<string, ModalidadeContagem> = new Map(),
): { data: string; aviso: string }[] {
  const vistas = new Set(itens.map((it) => it.data));
  return Array.from(vistas)
    .sort((a, b) => parseDataBR(b) - parseDataBR(a))
    .map((data) => ({ data, aviso: motivoInelegivel(data, itens, andamentoPorData, modalidadePorData) }))
    .filter((linha): linha is { data: string; aviso: string } => linha.aviso !== null);
}

/** Soma do valor (quantidade × preço) de todos os itens de uma contagem
 * específica - mesmo cálculo que já aparece em Contagem > Visualização. */
export function valorContagem(itens: ItemInventario[], data: string): number {
  return itens.filter((it) => it.data === data).reduce((soma, it) => soma + (it.total ?? 0), 0);
}

/** Itens da contagem sem valor (sem preço no cadastro, avulso sem cadastro ou
 * quantidade em branco). Continuam valendo R$ 0 no cálculo - a fórmula não
 * muda -, mas a tela avisa quantos são pra ninguém ler o estoque como
 * completo sem saber. */
export function itensSemValor(itens: ItemInventario[], data: string): number {
  return itens.filter((it) => it.data === data && it.total === null).length;
}

/** Por que a data não pode ser estoque inicial/final, ou null se pode.
 * - data sem nenhum item contado não existe como contagem;
 * - unidade no banco (mapa de modalidade preenchido): data sem cabeçalho não
 *   tem contexto pra provar que está completa;
 * - contagem por setor só entra com todos os setores concluídos, e snapshot
 *   vazio nunca vira "legada" por falta de andamento. */
function motivoInelegivel(
  data: string,
  itens: ItemInventario[],
  andamentoPorData: Map<string, AndamentoSetor[]>,
  modalidadePorData: Map<string, ModalidadeContagem>,
): string | null {
  if (!itens.some((it) => it.data === data)) return `Não existe contagem em ${data}.`;
  const modalidade = modalidadePorData.get(data);
  if (modalidadePorData.size > 0 && !modalidade) {
    return `A contagem de ${data} não foi encontrada no banco.`;
  }
  const andamento = andamentoPorData.get(data) ?? [];
  if (situacaoDaData(andamento, modalidade) === "parcial") {
    return avisoDeContagemParcial(andamento, modalidade) || "Contagem parcial.";
  }
  return null;
}

/** Recusa data que não pode ser estoque inicial/final. Vale mesmo para quem
 * chama `calcularCmv` direto, sem passar pelo seletor da tela. */
function exigirDataElegivel(
  data: string,
  itens: ItemInventario[],
  andamentoPorData: Map<string, AndamentoSetor[]>,
  modalidadePorData: Map<string, ModalidadeContagem>,
): void {
  const motivo = motivoInelegivel(data, itens, andamentoPorData, modalidadePorData);
  if (motivo !== null) {
    throw new Error(`A contagem de ${data} não pode entrar no CMV. ${motivo}`);
  }
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
  /** Andamento por setor de cada data. Obrigatório: é com ele que o cálculo
   * recusa data parcial. Unidade sem setor passa um mapa vazio (legado). */
  andamentoPorData: Map<string, AndamentoSetor[]>;
  /** Modalidade do cabeçalho de cada data. Vazio só para unidade na planilha. */
  modalidadePorData?: Map<string, ModalidadeContagem>;
}): ResultadoCmv {
  const modalidades = params.modalidadePorData ?? new Map<string, ModalidadeContagem>();
  exigirDataElegivel(params.dataInicial, params.itensInventario, params.andamentoPorData, modalidades);
  exigirDataElegivel(params.dataFinal, params.itensInventario, params.andamentoPorData, modalidades);
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
