import type { ContaValorDre, Dre, SubgrupoDre } from "./dre";
import { somarValores } from "./parcelas";

/** Uma linha da árvore de UM mês - função pura, sem React. `nivel` decide a
 * indentação (0 = grupo/subtotal/resultado, 1 = subgrupo ou linha direta de
 * CMV, 2 = conta-filha); `destaque` marca linha de resultado ("="), sempre em
 * negrito na UI. `filhos`, quando presente, é o que a seta de expandir da
 * própria linha abre/fecha - grupo sem `filhos` (ex: linhas de resultado) não
 * tem seta. Linhas de percentual não entram aqui: só existem na etapa anual
 * (`dre-anual.ts`), porque o Total/Média delas usa o Total/Média do valor
 * absoluto já agregado, nunca a média das 12 razões mensais. */
export type LinhaDreMensal = {
  id: string;
  rotulo: string;
  nivel: 0 | 1 | 2;
  destaque?: boolean;
  valor: number | null;
  filhos?: LinhaDreMensal[];
};

function linhasContas(contas: ContaValorDre[], nivel: 1 | 2): LinhaDreMensal[] {
  return contas.map((c) => ({ id: c.id, rotulo: c.nome, nivel, valor: c.valor }));
}

function linhasSubgrupos(subgrupos: SubgrupoDre[], nivelSubgrupo: 1, nivelConta: 2): LinhaDreMensal[] {
  return subgrupos.map((sg) => ({
    id: sg.id,
    rotulo: sg.nome,
    nivel: nivelSubgrupo,
    valor: sg.total,
    filhos: linhasContas(sg.contas, nivelConta),
  }));
}

/** As 5 linhas do CMV expandido (CMC como etapa interna, nunca grupo
 * principal) sempre com os mesmos 5 ids, mesmo quando o estoque mensal da
 * competência não foi cadastrado (`dre.cmv === null`) - nesse caso todo
 * mundo vem `null` (nunca 0), pra árvore de todo mês do ano ter exatamente a
 * mesma forma e dar pra combinar mês a mês na etapa anual. */
function filhosCmv(dre: Dre): LinhaDreMensal[] {
  const cmv = dre.cmv;
  return [
    { id: "cmv_estoque_inicial_merc", rotulo: "Estoque inicial de Mercadorias", nivel: 1, valor: cmv?.estoqueInicialMercadorias ?? null },
    { id: "cmv_estoque_inicial_emb", rotulo: "Estoque inicial de Embalagens", nivel: 1, valor: cmv?.estoqueInicialEmbalagens ?? null },
    {
      id: "cmv_cmc",
      rotulo: "CMC",
      nivel: 1,
      valor: cmv?.cmc ?? null,
      filhos: [
        { id: "cmv_compras_merc", rotulo: "Compras de Mercadorias", nivel: 2, valor: cmv?.comprasMercadorias ?? null },
        { id: "cmv_compras_emb", rotulo: "Compras de Embalagens", nivel: 2, valor: cmv?.comprasEmbalagens ?? null },
      ],
    },
    { id: "cmv_estoque_final_merc", rotulo: "(-) Estoque final de Mercadorias", nivel: 1, valor: cmv?.estoqueFinalMercadorias ?? null },
    { id: "cmv_estoque_final_emb", rotulo: "(-) Estoque final de Embalagens", nivel: 1, valor: cmv?.estoqueFinalEmbalagens ?? null },
  ];
}

export type ArvoreMensalDre = { principal: LinhaDreMensal[]; indicador: LinhaDreMensal[] };

/** Árvore hierárquica de um único mês, pronta pra combinar com os outros 11
 * meses do ano (`dre-anual.ts`). Preserva a estrutura já calculada por
 * `calcularDre` - só monta a apresentação, nenhuma fórmula nova aqui além de
 * Receita Operacional Líquida (Receita Bruta − Deduções), que é derivada dos
 * dois totais já existentes, não um cálculo novo no motor. */
export function montarArvoreMensal(dre: Dre): ArvoreMensalDre {
  const receitaLiquida = somarValores([dre.receitas.total, -dre.deducoes.total]);

  const principal: LinhaDreMensal[] = [
    { id: "receita_bruta", rotulo: "Receita Operacional Bruta", nivel: 0, valor: dre.receitas.total, filhos: linhasContas(dre.receitas.contas, 1) },
    { id: "deducoes", rotulo: "(-) Deduções", nivel: 0, valor: dre.deducoes.total, filhos: linhasSubgrupos(dre.deducoes.subgrupos, 1, 2) },
    { id: "receita_liquida", rotulo: "= Receita Operacional Líquida", nivel: 0, valor: receitaLiquida, destaque: true },
    { id: "cmv", rotulo: "(-) CMV", nivel: 0, valor: dre.cmv?.total ?? null, filhos: filhosCmv(dre) },
    { id: "margem", rotulo: "= Margem de Contribuição", nivel: 0, valor: dre.margemContribuicao, destaque: true },
    { id: "cmo", rotulo: "(-) CMO", nivel: 0, valor: dre.cmo.total, filhos: linhasContas(dre.cmo.contas, 1) },
    {
      id: "custos_operacionais",
      rotulo: "(-) Custos Operacionais",
      nivel: 0,
      valor: dre.custosOperacionais.total,
      filhos: linhasSubgrupos(dre.custosOperacionais.subgrupos, 1, 2),
    },
    { id: "resultado_operacional", rotulo: "= Resultado Operacional", nivel: 0, valor: dre.resultadoOperacional, destaque: true },
    // Resultado Econômico é o fechamento da própria DRE - Saídas Não
    // Operacionais nunca reduzem esta linha (por isso o mesmo valor de
    // Resultado Operacional, sem nenhum cálculo novo). Geração de Caixa após
    // Saídas Não Operacionais é o indicador gerencial separado, na seção
    // `indicador` abaixo - as duas linhas nunca se confundem.
    { id: "resultado_economico", rotulo: "= Resultado Econômico", nivel: 0, valor: dre.resultadoOperacional, destaque: true },
  ];

  const indicador: LinhaDreMensal[] = [
    {
      id: "saidas",
      rotulo: "(-) Saídas Não Operacionais",
      nivel: 0,
      valor: dre.saidasNaoOperacionais.total,
      filhos: linhasContas(dre.saidasNaoOperacionais.contas, 1),
    },
    {
      id: "geracao_caixa",
      rotulo: "= Geração de Caixa após Saídas Não Operacionais",
      nivel: 0,
      valor: dre.geracaoCaixaAposSaidas,
      destaque: true,
    },
  ];

  return { principal, indicador };
}
