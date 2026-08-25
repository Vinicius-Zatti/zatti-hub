import { PAPEIS_DRE_SOMENTE_PROVISAO, type CategoriaFinanceira, type NoArvoreCategoria, type PapelDre } from "./tipos";

/** Grupos/subgrupos onde o cliente pode criar categoria própria (nova conta
 * folha), e o `papelDre` que a conta nova herda automaticamente - nunca
 * escolhido à mão, senão uma conta customizada podia cair no bucket errado
 * da DRE. CMC (dentro do CMV) fica de fora de propósito: tem duas contas
 * padrão com papéis diferentes (mercadorias/embalagens), então adicionar
 * uma conta nova ali seria ambíguo - e CMV é fórmula fechada (estoque
 * inicial + CMC − estoque final), não um plano de contas livre. */
export const CATEGORIAS_PAI_PERMITIDAS: Record<string, PapelDre> = {
  receita: "receita",
  deducoes_da_receita: "deducao_receita",
  custos_venda_variaveis: "custo_venda_variavel",
  cmo: "cmo",
  custos_ocupacao: "custo_ocupacao",
  custos_administrativos: "custo_administrativo",
  custos_comerciais: "custo_comercial",
  custos_venda_fixos: "custo_venda_fixo",
  saidas_nao_operacionais: "saida_nao_operacional",
};

/** Monta a árvore (grupo principal → grupo/subgrupo → conta) a partir da
 * lista flat vinda do banco - a ordenação de cada nível de filhos respeita
 * `ordem`, categoria própria (`padrao = false`) sempre depois das padrão do
 * mesmo pai. */
export function montarArvoreCategorias(categorias: CategoriaFinanceira[]): NoArvoreCategoria[] {
  const porId = new Map<string, NoArvoreCategoria>();
  for (const categoria of categorias) {
    porId.set(categoria.id, { ...categoria, filhos: [] });
  }

  const raizes: NoArvoreCategoria[] = [];
  for (const categoria of categorias) {
    const no = porId.get(categoria.id);
    if (!no) continue;
    if (categoria.parentId === null) {
      raizes.push(no);
      continue;
    }
    const pai = porId.get(categoria.parentId);
    if (pai) pai.filhos.push(no);
  }

  function ordenar(nos: NoArvoreCategoria[]): void {
    nos.sort((a, b) => (a.padrao === b.padrao ? a.ordem - b.ordem : a.padrao ? -1 : 1));
    for (const no of nos) ordenar(no.filhos);
  }
  ordenar(raizes);

  return raizes;
}

/** Só as contas-folha realmente usáveis em lançamento manual - exclui as 3
 * que só recebem valor do motor de Provisões (ver `PAPEIS_DRE_SOMENTE_PROVISAO`
 * em tipos.ts) e categoria arquivada. */
export function listarContasLancaveis(categorias: CategoriaFinanceira[]): CategoriaFinanceira[] {
  return categorias.filter(
    (c) => c.nivel === "conta" && !c.arquivado && !(c.papelDre && PAPEIS_DRE_SOMENTE_PROVISAO.includes(c.papelDre)),
  );
}

/** "CMO > Folha salarial contábil" - sobe a cadeia de pais até a raiz. Nome
 * repete em vários grupos (ex: 6 contas "Outros"/"Outras" diferentes), por
 * isso o seletor de Plano de Contas nunca mostra só o nome da folha, sempre
 * o caminho inteiro. */
export function caminhoCategoria(categoriaId: string, categorias: CategoriaFinanceira[]): string {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const partes: string[] = [];
  let atual = porId.get(categoriaId);
  while (atual) {
    partes.unshift(atual.nome);
    atual = atual.parentId ? porId.get(atual.parentId) : undefined;
  }
  return partes.join(" > ");
}

/** Contas-folha lançáveis já com o caminho pronto pro seletor com busca de
 * Receitas/Despesas. */
export function listarContasComCaminho(
  categorias: CategoriaFinanceira[],
): { id: string; caminho: string }[] {
  return listarContasLancaveis(categorias).map((c) => ({ id: c.id, caminho: caminhoCategoria(c.id, categorias) }));
}
