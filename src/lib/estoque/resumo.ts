import type { ItemInventario, Pedido, Produto } from "@/lib/types";

// Números do Estoque que o Painel geral (/painel) mostra. Saíram de
// `app/(app)/painel/page.tsx` em 24/10/2026, sem mudar nenhuma conta, para a
// Visão geral do Estoque (Navegação V2) usar exatamente os mesmos números.
// Função pura: as leituras (planilha/banco) continuam em quem chama.

function instanteData(valor: string): number {
  const [dia, mes, ano] = valor.split("/").map(Number);
  if (dia && mes && ano) return new Date(ano, mes - 1, dia).getTime();
  const instante = Date.parse(valor);
  return Number.isNaN(instante) ? 0 : instante;
}

export type ResumoEstoque = {
  produtosAtivos: number;
  grupos: number;
  ultimaContagem: string | null;
  itensContados: number;
  valorEstoque: number;
  alertasCompra: number;
  possiveisErros: number;
  produtosSemPreco: number;
  pedidosPendentes: number;
  valorPedidosPendentes: number;
};

export function resumirEstoque(produtos: Produto[], inventario: ItemInventario[], pedidos: Pedido[]): ResumoEstoque {
  const datas = Array.from(new Set(inventario.map((item) => item.data).filter(Boolean)));
  const ultimaContagem = datas.sort((a, b) => instanteData(b) - instanteData(a))[0] ?? null;
  const itensUltimaContagem = ultimaContagem ? inventario.filter((item) => item.data === ultimaContagem) : [];
  // Pedido "real" = tem ao menos um item com vencedor confirmado.
  const pedidosReais = pedidos
    .map((pedido) => ({ ...pedido, itens: pedido.itens.filter((item) => item.vencedorConfirmado) }))
    .filter((pedido) => pedido.itens.length > 0);
  const pedidosPendentes = pedidosReais.filter((pedido) => !pedido.recebido);
  const ativos = produtos.filter((produto) => produto.ativo);

  return {
    produtosAtivos: ativos.length,
    grupos: new Set(ativos.map((produto) => produto.grupo).filter(Boolean)).size,
    ultimaContagem,
    itensContados: itensUltimaContagem.length,
    valorEstoque: itensUltimaContagem.reduce((total, item) => total + (item.total ?? 0), 0),
    alertasCompra: itensUltimaContagem.filter((item) => item.alerta === "Comprar emergencial").length,
    possiveisErros: itensUltimaContagem.filter((item) => item.alerta === "Possível erro de contagem").length,
    produtosSemPreco: ativos.filter((produto) => produto.precoUnitario === null).length,
    pedidosPendentes: pedidosPendentes.length,
    valorPedidosPendentes: pedidosPendentes.reduce(
      (total, pedido) =>
        total +
        pedido.itens.reduce(
          (subtotal, item) => subtotal + item.quantidadePedida * (item.precoAtualizado ?? item.precoAntigo ?? 0),
          0,
        ),
      0,
    ),
  };
}
