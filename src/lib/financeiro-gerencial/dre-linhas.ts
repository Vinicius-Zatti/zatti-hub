import type { ContaValorDre, Dre } from "./dre";

/** Uma linha renderizável da DRE (resumida ou expandida) - função pura, sem
 * React, pra dar pra testar direto (critério de aceite 4/5: resumida oculta
 * contas-filhas e CMC interno, expandida mostra tudo). `nivel` decide a
 * indentação (0 = grupo/total, 1 = subgrupo, 2 = conta-filha); `destaque`
 * marca linha de subtotal/total ("="), sempre em negrito na UI. */
export type LinhaDre = {
  id: string;
  rotulo: string;
  valor: number | null;
  nivel: 0 | 1 | 2;
  destaque?: boolean;
};

export type SecoesDre = { principal: LinhaDre[]; indicador: LinhaDre[] };

function linhasContas(contas: ContaValorDre[], nivel: 1 | 2): LinhaDre[] {
  return contas.map((c) => ({ id: c.id, rotulo: c.nome, valor: c.valor, nivel }));
}

/** Só os grupos/totais - nenhuma conta-filha, e o CMC (etapa interna do CMV)
 * nem aparece: só o CMV já calculado (fórmula fechada). */
export function montarLinhasResumida(dre: Dre): SecoesDre {
  const principal: LinhaDre[] = [
    { id: "receita_bruta", rotulo: "Receita Operacional Bruta", valor: dre.receitas.total, nivel: 0 },
    { id: "deducoes", rotulo: "(-) Total de Deduções", valor: dre.deducoes.total, nivel: 0 },
    { id: "cmv", rotulo: "(-) CMV", valor: dre.cmv?.total ?? null, nivel: 0 },
    { id: "margem", rotulo: "= MARGEM DE CONTRIBUIÇÃO", valor: dre.margemContribuicao, nivel: 0, destaque: true },
    { id: "cmo", rotulo: "(-) Total CMO", valor: dre.cmo.total, nivel: 0 },
    { id: "custos_operacionais", rotulo: "(-) Total Custos Operacionais", valor: dre.custosOperacionais.total, nivel: 0 },
    { id: "resultado_operacional", rotulo: "= RESULTADO OPERACIONAL", valor: dre.resultadoOperacional, nivel: 0, destaque: true },
  ];
  const indicador: LinhaDre[] = [
    { id: "saidas_nao_operacionais", rotulo: "Saídas Não Operacionais", valor: dre.saidasNaoOperacionais.total, nivel: 0 },
    {
      id: "geracao_caixa",
      rotulo: "= Geração de Caixa após Saídas Não Operacionais",
      valor: dre.geracaoCaixaAposSaidas,
      nivel: 0,
      destaque: true,
    },
  ];
  return { principal, indicador };
}

/** Grupo → subgrupo → conta-filha, com CMC como etapa expansível dentro do
 * CMV (Estoque inicial/CMC/Estoque final) - nunca como grupo independente. */
export function montarLinhasExpandida(dre: Dre): SecoesDre {
  const principal: LinhaDre[] = [
    { id: "receita_titulo", rotulo: "RECEITA OPERACIONAL BRUTA", valor: null, nivel: 0 },
    ...linhasContas(dre.receitas.contas, 1),
    { id: "receita_bruta", rotulo: "= Receita Operacional Bruta", valor: dre.receitas.total, nivel: 0, destaque: true },

    { id: "deducoes_titulo", rotulo: "(-) DEDUÇÕES", valor: null, nivel: 0 },
    ...dre.deducoes.subgrupos.flatMap((sg) => [
      { id: sg.id, rotulo: sg.nome, valor: sg.total, nivel: 1 as const },
      ...linhasContas(sg.contas, 2),
    ]),
    { id: "deducoes_total", rotulo: "= Total de Deduções", valor: dre.deducoes.total, nivel: 0, destaque: true },

    { id: "cmv_titulo", rotulo: "(-) CMV", valor: null, nivel: 0 },
    ...(dre.cmv
      ? [
          { id: "cmv_estoque_inicial_merc", rotulo: "Estoque inicial de Mercadorias", valor: dre.cmv.estoqueInicialMercadorias, nivel: 1 as const },
          { id: "cmv_estoque_inicial_emb", rotulo: "Estoque inicial de Embalagens", valor: dre.cmv.estoqueInicialEmbalagens, nivel: 1 as const },
          { id: "cmv_cmc_titulo", rotulo: "CMC", valor: dre.cmv.cmc, nivel: 1 as const },
          { id: "cmv_compras_merc", rotulo: "Compras de Mercadorias", valor: dre.cmv.comprasMercadorias, nivel: 2 as const },
          { id: "cmv_compras_emb", rotulo: "Compras de Embalagens", valor: dre.cmv.comprasEmbalagens, nivel: 2 as const },
          { id: "cmv_estoque_final_merc", rotulo: "(-) Estoque final de Mercadorias", valor: dre.cmv.estoqueFinalMercadorias, nivel: 1 as const },
          { id: "cmv_estoque_final_emb", rotulo: "(-) Estoque final de Embalagens", valor: dre.cmv.estoqueFinalEmbalagens, nivel: 1 as const },
        ]
      : [{ id: "cmv_pendente", rotulo: "Estoque mensal ainda não cadastrado nesta competência", valor: null, nivel: 1 as const }]),
    { id: "cmv_total", rotulo: "= CMV", valor: dre.cmv?.total ?? null, nivel: 0, destaque: true },

    { id: "margem", rotulo: "= MARGEM DE CONTRIBUIÇÃO", valor: dre.margemContribuicao, nivel: 0, destaque: true },

    { id: "cmo_titulo", rotulo: "(-) CMO", valor: null, nivel: 0 },
    ...linhasContas(dre.cmo.contas, 1),
    { id: "cmo_total", rotulo: "= Total CMO", valor: dre.cmo.total, nivel: 0, destaque: true },

    { id: "custos_operacionais_titulo", rotulo: "(-) CUSTOS OPERACIONAIS", valor: null, nivel: 0 },
    ...dre.custosOperacionais.subgrupos.flatMap((sg) => [
      { id: sg.id, rotulo: sg.nome, valor: sg.total, nivel: 1 as const },
      ...linhasContas(sg.contas, 2),
    ]),
    { id: "custos_operacionais_total", rotulo: "= Total Custos Operacionais", valor: dre.custosOperacionais.total, nivel: 0, destaque: true },

    { id: "resultado_operacional", rotulo: "= RESULTADO OPERACIONAL", valor: dre.resultadoOperacional, nivel: 0, destaque: true },
  ];

  const indicador: LinhaDre[] = [
    { id: "saidas_titulo", rotulo: "SAÍDAS NÃO OPERACIONAIS", valor: null, nivel: 0 },
    ...linhasContas(dre.saidasNaoOperacionais.contas, 1),
    { id: "saidas_total", rotulo: "Saídas Não Operacionais", valor: dre.saidasNaoOperacionais.total, nivel: 0, destaque: true },
    {
      id: "geracao_caixa",
      rotulo: "= Geração de Caixa após Saídas Não Operacionais",
      valor: dre.geracaoCaixaAposSaidas,
      nivel: 0,
      destaque: true,
    },
  ];

  return { principal, indicador };
}
