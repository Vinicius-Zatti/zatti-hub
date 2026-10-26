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
