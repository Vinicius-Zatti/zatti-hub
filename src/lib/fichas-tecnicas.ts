import type {
  CamadaFicha,
  ClassificacaoMargem,
  ComponenteFicha,
  ConfiguracaoFinanceira,
  CustoFicha,
  EtapaFicha,
  FichaTecnicaResumo,
  MargemContribuicao,
} from "@/lib/types";

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

/** Toda quantidade de Ficha Técnica (rendimento, componente) mostra sempre
 * 3 casas decimais em português (vírgula) - nunca `{numero}` cru no JSX,
 * que sai em ponto e sem casa fixa (bug real: "0.9" em vez de "0,900"). */
export function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

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

/** Indicadores da Calculadora de Margem Ideal - `null` nos que dependem de
 * faturamento quando ele é 0 (nada pra dividir ainda, não é erro).
 * `deducoesTotal` (taxa de pagamento + imposto) não depende de faturamento,
 * por isso nunca é null. */
export function calcularMargemContribuicao(config: ConfiguracaoFinanceira): MargemContribuicao {
  const { faturamentoMedioMensal, custoFixoMedioMensal, lucroDesejadoValor, taxaPagamento, aliquotaImposto } = config;
  const deducoesTotal = (taxaPagamento ?? 0) + (aliquotaImposto ?? 0);
  if (faturamentoMedioMensal <= 0) {
    return {
      percentualCustoFixo: null,
      lucroDesejadoPercentual: null,
      margemPontoEquilibrio: null,
      margemNecessaria: null,
      deducoesTotal,
    };
  }
  const percentualCustoFixo = custoFixoMedioMensal / faturamentoMedioMensal;
  const lucroDesejadoPercentual = lucroDesejadoValor / faturamentoMedioMensal;
  return {
    percentualCustoFixo,
    lucroDesejadoPercentual,
    margemPontoEquilibrio: percentualCustoFixo,
    margemNecessaria: percentualCustoFixo + lucroDesejadoPercentual,
    deducoesTotal,
  };
}

/** CMV = quanto do preço de venda é consumido pelo custo do insumo, em %.
 * `null` sem preço de venda ou preço zerado (nada pra dividir). */
export function calcularCmv(custoInsumos: number, precoVenda: number | null): number | null {
  if (precoVenda === null || precoVenda <= 0) return null;
  return (custoInsumos / precoVenda) * 100;
}

/** Margem de contribuição real do produto - preço de venda menos CMV menos
 * as deduções (taxa de pagamento + imposto, que também incidem sobre o
 * preço de venda). Fração (0,45 = 45%), não percentual. */
export function calcularMargemProduto(
  custoInsumos: number | null,
  precoVenda: number | null,
  deducoesTotal: number,
): number | null {
  if (custoInsumos === null || precoVenda === null || precoVenda <= 0) return null;
  return 1 - custoInsumos / precoVenda - deducoesTotal;
}

/** Preço que faz o CMV representar exatamente `1 - margem necessária -
 * deduções` do preço de venda - ex: margem necessária 50% + deduções 13%
 * -> CMV alvo 37% -> preço = custo / 0,37. `null` sem custo, sem margem
 * calculada, ou alvo <= 0 (deduções+margem somam 100% ou mais, impossível
 * bater com preço nenhum). */
export function calcularPrecoVendaSugerido(
  custoInsumos: number | null,
  margemNecessaria: number | null,
  deducoesTotal: number,
): number | null {
  if (custoInsumos === null || margemNecessaria === null) return null;
  const cmvAlvo = 1 - margemNecessaria - deducoesTotal;
  if (cmvAlvo <= 0) return null;
  return custoInsumos / cmvAlvo;
}

/** Etiqueta ao lado do preço de venda - compara a margem real do produto
 * contra a margem necessária (lucro batido) e a margem de ponto de
 * equilíbrio (só cobre custo fixo, sem lucro). */
export function classificarMargemProduto(
  margemProduto: number | null,
  margemNecessaria: number | null,
  margemPontoEquilibrio: number | null,
): ClassificacaoMargem | null {
  if (margemProduto === null || margemNecessaria === null || margemPontoEquilibrio === null) return null;
  if (margemProduto >= margemNecessaria) return "lucro_ajustado";
  if (margemProduto >= margemPontoEquilibrio) return "abaixo_do_lucro";
  return "prejuizo";
}
