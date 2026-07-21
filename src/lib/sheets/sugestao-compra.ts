import { listProdutos } from "./produtos";
import { listInventario } from "./inventario";
import type { SugestaoCompra } from "@/lib/types";

function parseDataBr(d: string): number {
  // "DD/MM/AAAA" -> timestamp, pra achar/ordenar contagens por data
  const [dia, mes, ano] = d.split("/").map(Number);
  if (!dia || !mes || !ano) return 0;
  return new Date(ano, mes - 1, dia).getTime();
}

/** Datas de contagem já registradas, mais recente primeiro - base pro
 * seletor "de qual contagem" em Pedidos. */
export async function datasDisponiveis(tenantId?: string): Promise<string[]> {
  const inventario = await listInventario(tenantId);
  const datas = new Set(inventario.map((it) => it.data).filter(Boolean));
  return Array.from(datas).sort((a, b) => parseDataBr(b) - parseDataBr(a));
}

/** Gera a lista completa de produtos ativos (dentro do escopo escolhido) com
 * o que falta pra bater o estoque necessário da semana. Traz TODO MUNDO do
 * escopo, não só quem precisa comprar - a tabela de Pedidos usa isso pra
 * conferência ("os pedidos foram montados certo?"), não só pra lista de
 * compra. */
export async function gerarPedido(
  opcoes: { data?: string; grupos?: string[] } = {},
  tenantId?: string
): Promise<{ itens: SugestaoCompra[]; dataUsada: string }> {
  const [produtos, inventario] = await Promise.all([
    listProdutos(tenantId),
    listInventario(tenantId),
  ]);

  const dataUsada = opcoes.data || datasMaisRecente(inventario);

  const contagemPorSku = new Map<string, number>();
  for (const item of inventario) {
    if (item.data !== dataUsada || item.quantidade === null) continue;
    contagemPorSku.set(item.sku, item.quantidade);
  }

  const grupos = opcoes.grupos && opcoes.grupos.length > 0 ? new Set(opcoes.grupos) : null;

  const itens: SugestaoCompra[] = [];
  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.estoqueNecessarioSemana === null) continue;
    if (grupos && !grupos.has(produto.grupo)) continue;

    const estoqueAtual = contagemPorSku.get(produto.sku) ?? null;
    const quantidadeSugerida =
      estoqueAtual === null ? 0 : Math.max(0, produto.estoqueNecessarioSemana - estoqueAtual);

    itens.push({
      sku: produto.sku,
      grupo: produto.grupo,
      nome: produto.nome,
      unidadeBase: produto.unidadeBase,
      precoUnitario: produto.precoUnitario,
      estoqueAtual,
      estoqueNecessario: produto.estoqueNecessarioSemana,
      quantidadeSugerida,
      precisaComprar: quantidadeSugerida > 0,
      fornecedores: [produto.fornecedor1, produto.fornecedor2, produto.fornecedor3, produto.fornecedor4].filter(
        (f) => f && f.trim() !== ""
      ),
    });
  }

  return { itens, dataUsada };
}

function datasMaisRecente(inventario: { data: string }[]): string {
  let maior = "";
  let maiorTs = -1;
  for (const it of inventario) {
    const ts = parseDataBr(it.data);
    if (ts > maiorTs) {
      maiorTs = ts;
      maior = it.data;
    }
  }
  return maior;
}
