/** Setores que contaram um item avulso (pendência da contagem), pra o
 * produto criado a partir dele já nascer nesses setores. Sem isso o produto
 * ficava sem setor e sumia da contagem seguinte e da Criar Cotação (The House,
 * 18 a 22/10/2026: tabasco, ovo, barriga de porco). Vale a contagem mais
 * recente em que um setor contou o item; linha sem setor (legada) não entra. */

import type { ItemInventario } from "@/lib/types";
import { ordenarDatasContagemBase } from "@/lib/pedido";

// Mesmo prefixo de `lib/sheets/inventario.ts` (importar de lá traz o cliente
// do Sheets e do Supabase pra uma regra pura).
const PENDENTE_PREFIX = "PENDENTE-";

export function setoresDaPendencia(inventario: ItemInventario[], nome: string): string[] {
  const chave = nome.trim().toLowerCase();
  const linhas = inventario.filter(
    (item) => item.sku.startsWith(PENDENTE_PREFIX) && item.setorId && item.nome.trim().toLowerCase() === chave,
  );
  const [maisRecente] = ordenarDatasContagemBase(Array.from(new Set(linhas.map((l) => l.data))));
  if (!maisRecente) return [];
  const setores = linhas.filter((l) => l.data === maisRecente).map((l) => l.setorId as string);
  return Array.from(new Set(setores));
}
