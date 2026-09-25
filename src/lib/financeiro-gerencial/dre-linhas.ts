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
 * principal) sempre com os mesmos 5 ids, pra árvore de todo mês do ano ter a
 * mesma forma. Sem inventário do mês (`cmv.semInventario`), as 4 linhas de
 * estoque mostram "-" (não informado) e o CMV vira só o CMC - regra de
 * 25/09: a DRE nunca trava por falta de inventário. */
function filhosCmv(dre: Dre): LinhaDreMensal[] {
  const cmv = dre.cmv;
  const estoque = (v: number) => (cmv.semInventario ? null : v);
  return [
    { id: "cmv_estoque_inicial_merc", rotulo: "Estoque inicial de Mercadorias", nivel: 1, valor: estoque(cmv.estoqueInicialMercadorias) },
    { id: "cmv_estoque_inicial_emb", rotulo: "Estoque inicial de Embalagens", nivel: 1, valor: estoque(cmv.estoqueInicialEmbalagens) },
    {
      id: "cmv_cmc",
      rotulo: "CMC - Custo da Mercadoria Comprada",
      nivel: 1,
      valor: cmv.cmc,
      // Uma linha por conta do CMC (Custo com bebidas/mercadorias/proteínas,
      // Compras de embalagens).
      filhos: dre.contasCmc.map((c) => ({ id: c.id, rotulo: c.nome, nivel: 2, valor: c.valor })),
    },
    { id: "cmv_estoque_final_merc", rotulo: "(-) Estoque final de Mercadorias", nivel: 1, valor: estoque(cmv.estoqueFinalMercadorias) },
    { id: "cmv_estoque_final_emb", rotulo: "(-) Estoque final de Embalagens", nivel: 1, valor: estoque(cmv.estoqueFinalEmbalagens) },
  ];
}

/** Árvore hierárquica de um único mês, numa tabela só, pronta pra combinar
 * com os outros 11 meses do ano (`dre-anual.ts`). Preserva a estrutura já
 * calculada por `calcularDre` - só monta a apresentação, nenhuma fórmula
 * nova aqui além de Receita Operacional Líquida (Receita Bruta − Deduções) e
 * Resultado Econômico (Resultado Líquido − Saídas Não Operacionais), ambas
 * derivadas de totais já existentes, não um cálculo novo no motor. */
export function montarArvoreMensal(dre: Dre): LinhaDreMensal[] {
  const receitaLiquida = somarValores([dre.receitas.total, -dre.deducoes.total]);
  // Resultado Econômico é exatamente o que já era `geracaoCaixaAposSaidas` no
  // motor (Resultado Operacional − Saídas Não Operacionais) - só o nome/lugar
  // na apresentação mudou, nenhuma conta nova.
  const resultadoEconomico = dre.geracaoCaixaAposSaidas;

  return [
    {
      id: "receita_bruta",
      rotulo: "Receita Operacional Bruta",
      nivel: 0,
      valor: dre.receitas.total,
      filhos: [...linhasSubgrupos(dre.receitas.subgrupos, 1, 2), ...linhasContas(dre.receitas.contas, 1)],
    },
    { id: "deducoes", rotulo: "(-) Deduções", nivel: 0, valor: dre.deducoes.total, filhos: linhasSubgrupos(dre.deducoes.subgrupos, 1, 2) },
    { id: "receita_liquida", rotulo: "= Receita Operacional Líquida", nivel: 0, valor: receitaLiquida, destaque: true },
    { id: "cmv", rotulo: "(-) CMV - Custo da Mercadoria Vendida", nivel: 0, valor: dre.cmv.total, filhos: filhosCmv(dre) },
    { id: "margem", rotulo: "= Margem de Contribuição", nivel: 0, valor: dre.margemContribuicao, destaque: true },
    { id: "cmo", rotulo: "(-) CMO - Custo de Mão de Obra", nivel: 0, valor: dre.cmo.total, filhos: linhasSubgrupos(dre.cmo.subgrupos, 1, 2) },
    {
      id: "custos_operacionais",
      rotulo: "(-) Custos Operacionais",
      nivel: 0,
      valor: dre.custosOperacionais.total,
      filhos: linhasSubgrupos(dre.custosOperacionais.subgrupos, 1, 2),
    },
    { id: "resultado_operacional", rotulo: "= Resultado Operacional", nivel: 0, valor: dre.resultadoOperacional, destaque: true },
    // Definição de Vinícius (22/09): Resultado Líquido fecha a própria DRE -
    // Saídas Não Operacionais nunca reduzem esta linha (mesmo valor de
    // Resultado Operacional, sem cálculo novo). Resultado Econômico é o
    // Resultado Líquido menos as Saídas Não Operacionais.
    { id: "resultado_liquido", rotulo: "= Resultado Líquido", nivel: 0, valor: dre.resultadoOperacional, destaque: true },
    {
      id: "saidas",
      rotulo: "(-) Saídas Não Operacionais",
      nivel: 0,
      valor: dre.saidasNaoOperacionais.total,
      filhos: linhasContas(dre.saidasNaoOperacionais.contas, 1),
    },
    { id: "resultado_economico", rotulo: "= Resultado Econômico", nivel: 0, valor: resultadoEconomico, destaque: true },
  ];
}
