import type { SugestaoCompra } from "@/lib/types";
import { GRUPO_ORDEM } from "@/lib/grupos";

export const SEM_FORNECEDOR = "Sem fornecedor cadastrado";

/** Agrupa por fornecedor, pra montar a lista de cotação/pedido de cada um.
 * Sem fornecedor cadastrado só entra no grupo avulso se realmente precisa
 * comprar - senão o grupo vira ruído de produto que nem precisa de pedido.
 * Funções puras (sem I/O) de propósito - usadas tanto no servidor quanto em
 * componente client, não podem puxar nada de `lib/sheets/*`. */
export function agruparPorFornecedor(itens: SugestaoCompra[]): Record<string, SugestaoCompra[]> {
  const grupos: Record<string, SugestaoCompra[]> = {};
  for (const item of itens) {
    const fornecedores = item.fornecedores.length
      ? item.fornecedores
      : item.precisaComprar
        ? [SEM_FORNECEDOR]
        : [];
    for (const f of fornecedores) {
      if (!grupos[f]) grupos[f] = [];
      grupos[f].push(item);
    }
  }
  return grupos;
}

/** Fornecedores em ordem alfabética, com "Sem fornecedor cadastrado" sempre
 * por último (é o balde de exceção, não faz sentido competir com nome real
 * na ordenação). */
export function ordenarFornecedores(nomes: string[]): string[] {
  const semFornecedor = nomes.includes(SEM_FORNECEDOR);
  const resto = nomes.filter((n) => n !== SEM_FORNECEDOR).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return semFornecedor ? [...resto, SEM_FORNECEDOR] : resto;
}

/** Agrupa por Grupo de produto (Proteínas, Hortifrúti...), na mesma ordem
 * usada na Contagem - pra tabela de conferência do Pedido de Compras. */
export function agruparPorGrupo(itens: SugestaoCompra[]): Record<string, SugestaoCompra[]> {
  const grupos: Record<string, SugestaoCompra[]> = {};
  for (const item of itens) {
    if (!grupos[item.grupo]) grupos[item.grupo] = [];
    grupos[item.grupo].push(item);
  }
  return grupos;
}

export function ordenarGrupos(codigos: string[]): string[] {
  return [
    ...GRUPO_ORDEM.filter((g) => codigos.includes(g)),
    ...codigos.filter((g) => !GRUPO_ORDEM.includes(g)).sort((a, b) => a.localeCompare(b, "pt-BR")),
  ];
}
