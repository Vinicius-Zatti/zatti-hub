import { normalizarBusca } from "@/lib/busca";

/** Filtra uma lista de itens pelo nome ou pelo SKU, sem acento e sem caixa
 * (Vinícius, 26/10/2026: busca nas listas que a pessoa percorre para preencher
 * ou conferir). Só decide o que aparece: nunca mexe no que já foi digitado,
 * que mora fora da lista, indexado pelo SKU. Termo vazio devolve tudo.
 * `outrosTextos`: nomes extras do item que também valem (ex.: Nome de Compra). */
export function filtrarPorNomeOuSku<T extends { nome: string; sku: string }>(
  itens: readonly T[],
  termo: string,
  outrosTextos?: (item: T) => (string | null | undefined)[],
): T[] {
  const alvo = normalizarBusca(termo);
  if (!alvo) return [...itens];
  return itens.filter((item) =>
    [item.nome, item.sku, ...(outrosTextos?.(item) ?? [])].some(
      (texto) => typeof texto === "string" && normalizarBusca(texto).includes(alvo),
    ),
  );
}

/** Busca das telas que separam por fornecedor (Vinícius, 26/10/2026: "chegou
 * mega g, coloco na busca mega g e já vem o pedido da mega g"). Se o termo
 * bate com o nome do fornecedor, devolve o bloco inteiro dele; senão, só os
 * itens que batem por nome, SKU ou `outrosTextos`, como `filtrarPorNomeOuSku`.
 * Termo vazio devolve tudo. Também só decide o que aparece. */
export function filtrarPorFornecedorOuItem<T extends { nome: string; sku: string }>(
  fornecedor: string,
  itens: readonly T[],
  termo: string,
  outrosTextos?: (item: T) => (string | null | undefined)[],
): T[] {
  if (fornecedorCasaBusca(fornecedor, termo)) return [...itens];
  return filtrarPorNomeOuSku(itens, termo, outrosTextos);
}

/** O nome do fornecedor contém o termo, sem acento e sem caixa. Termo vazio não casa. */
export function fornecedorCasaBusca(fornecedor: string, termo: string): boolean {
  const alvo = normalizarBusca(termo);
  return alvo !== "" && normalizarBusca(fornecedor).includes(alvo);
}
