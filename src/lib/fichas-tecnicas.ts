import type { CamadaFicha, ComponenteFicha, EtapaFicha, FichaTecnicaResumo } from "@/lib/types";

/** Funções puras (sem I/O) de propósito - usadas tanto no servidor quanto em
 * componente client, não podem puxar nada de `lib/banco/*` nem `lib/sheets/*`
 * (arrastaria dependência de servidor pro bundle do navegador). */

export const CAMADA_LABEL: Record<CamadaFicha, string> = {
  PRE: "Pré-preparo",
  VEN: "Venda",
};

export type GrupoFichasPorCategoria = {
  categoriaId: string;
  categoriaNome: string;
  fichas: FichaTecnicaResumo[];
};

/** Agrupa a listagem por categoria dentro de uma mesma camada (PRE ou VEN),
 * ordenado alfabeticamente - é como a tela de listagem mobile monta os
 * blocos de cards. */
export function agruparFichasPorCategoria(fichas: FichaTecnicaResumo[]): GrupoFichasPorCategoria[] {
  const grupos = new Map<string, GrupoFichasPorCategoria>();
  for (const ficha of fichas) {
    const existente = grupos.get(ficha.categoriaId);
    if (existente) {
      existente.fichas.push(ficha);
    } else {
      grupos.set(ficha.categoriaId, {
        categoriaId: ficha.categoriaId,
        categoriaNome: ficha.categoriaNome,
        fichas: [ficha],
      });
    }
  }
  return [...grupos.values()].sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR"));
}

/** Reordena depois de mover/excluir um item na UI (drag ou botão de subir/
 * descer) - reatribui `ordem` sequencial 0..n a partir da posição atual no
 * array, que é a única fonte de verdade da ordem durante a edição. */
export function reordenarComponentes(itens: ComponenteFicha[]): ComponenteFicha[] {
  return itens.map((item, indice) => ({ ...item, ordem: indice }));
}

export function reordenarEtapas(itens: EtapaFicha[]): EtapaFicha[] {
  return itens.map((item, indice) => ({ ...item, ordem: indice }));
}
