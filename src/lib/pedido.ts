import type { SugestaoCompra } from "@/lib/types";

/** Agrupa por fornecedor, pra montar a lista de cotação/pedido de cada um.
 * Sem fornecedor cadastrado só entra no grupo avulso se realmente precisa
 * comprar - senão o grupo vira ruído de produto que nem precisa de pedido.
 * Função pura (sem I/O) de propósito - usada tanto no servidor quanto em
 * componente client, não pode puxar nada de `lib/sheets/*`. */
export function agruparPorFornecedor(itens: SugestaoCompra[]): Record<string, SugestaoCompra[]> {
  const grupos: Record<string, SugestaoCompra[]> = {};
  for (const item of itens) {
    const fornecedores = item.fornecedores.length
      ? item.fornecedores
      : item.precisaComprar
        ? ["Sem fornecedor cadastrado"]
        : [];
    for (const f of fornecedores) {
      if (!grupos[f]) grupos[f] = [];
      grupos[f].push(item);
    }
  }
  return grupos;
}
