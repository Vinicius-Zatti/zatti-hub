import type { CamadaFicha, ComponenteFicha, CustoFicha, EtapaFicha, FichaTecnicaResumo } from "@/lib/types";

/** Funções puras (sem I/O) de propósito - usadas tanto no servidor quanto em
 * componente client, não podem puxar nada de `lib/banco/*` nem `lib/sheets/*`
 * (arrastaria dependência de servidor pro bundle do navegador). */

export const CAMADA_LABEL: Record<CamadaFicha, string> = {
  PRE: "Pré-preparo",
  VEN: "Venda",
};

/** Grupos de produto (ver `src/lib/skus/sugerir.ts`) que nunca entram numa
 * receita - limpeza e material de escritório não são insumo de ficha
 * técnica. Usado tanto pro seletor de componente quanto pra tabela de
 * Conversões, os dois não devem nem listar esses produtos. */
export const GRUPOS_FORA_DE_FICHA = new Set(["LIM", "OPE"]);

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

/** Estimativa de custo ao vivo, enquanto a ficha ainda está sendo montada no
 * formulário (antes de salvar) - mesma lógica de `calcularCustoFicha` no
 * servidor, mas usando preços já resolvidos (produto direto, sub-receita já
 * com custo por unidade calculado) em vez de consultar o banco de novo. */
export function calcularCustoEstimado(
  componentes: Pick<ComponenteFicha, "tipo" | "produtoSku" | "fichaComponenteId" | "quantidade">[],
  custosPorProdutoSku: Map<string, number | null>,
  custosPorFichaId: Map<string, number | null>,
  rendimentoQuantidade: number,
): CustoFicha {
  if (componentes.length === 0) return { custoTotal: null, custoPorUnidade: null, completo: false };

  let total = 0;
  let completo = true;
  for (const c of componentes) {
    const custoUnitario =
      c.tipo === "produto" ? (custosPorProdutoSku.get(c.produtoSku ?? "") ?? null) : (custosPorFichaId.get(c.fichaComponenteId ?? "") ?? null);
    if (custoUnitario === null) {
      completo = false;
      continue;
    }
    total += custoUnitario * c.quantidade;
  }

  return {
    custoTotal: total,
    custoPorUnidade: rendimentoQuantidade > 0 ? total / rendimentoQuantidade : null,
    completo,
  };
}
