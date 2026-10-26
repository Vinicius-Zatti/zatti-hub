import { normalizarBusca } from "@/lib/busca";

/** Filtra uma lista de itens pelo nome ou pelo SKU, sem acento e sem caixa
 * (Vinícius, 26/10/2026: busca nas listas que a pessoa percorre para preencher
 * ou conferir). Só decide o que aparece: nunca mexe no que já foi digitado,
 * que mora fora da lista, indexado pelo SKU. Termo vazio devolve tudo. */
export function filtrarPorNomeOuSku<T extends { nome: string; sku: string }>(
  itens: readonly T[],
  termo: string,
): T[] {
  const alvo = normalizarBusca(termo);
  if (!alvo) return [...itens];
  return itens.filter(
    (item) => normalizarBusca(item.nome).includes(alvo) || normalizarBusca(item.sku).includes(alvo),
  );
}
