import { listProdutos } from "./produtos";
import { listInventario } from "./inventario";
import type { SugestaoCompra } from "@/lib/types";

function parseDataBr(d: string): number {
  // "DD/MM/AAAA" -> timestamp, pra achar a contagem mais recente por SKU
  const [dia, mes, ano] = d.split("/").map(Number);
  if (!dia || !mes || !ano) return 0;
  return new Date(ano, mes - 1, dia).getTime();
}

export async function gerarSugestaoCompra(tenantId?: string): Promise<SugestaoCompra[]> {
  const [produtos, inventario] = await Promise.all([
    listProdutos(tenantId),
    listInventario(tenantId),
  ]);

  // pega só a contagem mais recente de cada SKU
  const ultimaContagemPorSku = new Map<string, { quantidade: number; data: string }>();
  for (const item of inventario) {
    if (item.quantidade === null) continue;
    const atual = ultimaContagemPorSku.get(item.sku);
    if (!atual || parseDataBr(item.data) > parseDataBr(atual.data)) {
      ultimaContagemPorSku.set(item.sku, { quantidade: item.quantidade, data: item.data });
    }
  }

  const sugestoes: SugestaoCompra[] = [];

  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.estoqueNecessarioSemana === null) continue;

    const contagem = ultimaContagemPorSku.get(produto.sku);
    const estoqueAtual = contagem?.quantidade ?? 0;
    const quantidadeSugerida = Math.max(0, produto.estoqueNecessarioSemana - estoqueAtual);

    if (quantidadeSugerida <= 0) continue;

    sugestoes.push({
      sku: produto.sku,
      nome: produto.nome,
      unidadeBase: produto.unidadeBase,
      estoqueAtual,
      estoqueNecessario: produto.estoqueNecessarioSemana,
      quantidadeSugerida,
      fornecedores: [produto.fornecedor1, produto.fornecedor2, produto.fornecedor3, produto.fornecedor4].filter(
        (f) => f && f.trim() !== ""
      ),
    });
  }

  return sugestoes;
}

/** Agrupa a sugestão por fornecedor, pra montar a lista de cotação de cada um. */
export function agruparPorFornecedor(
  sugestoes: SugestaoCompra[]
): Record<string, SugestaoCompra[]> {
  const grupos: Record<string, SugestaoCompra[]> = {};
  for (const s of sugestoes) {
    const fornecedores = s.fornecedores.length ? s.fornecedores : ["Sem fornecedor cadastrado"];
    for (const f of fornecedores) {
      if (!grupos[f]) grupos[f] = [];
      grupos[f].push(s);
    }
  }
  return grupos;
}
