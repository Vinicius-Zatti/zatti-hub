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

/** Bloco de custo da mercadoria (regra final de 25/09): duas linhas só.
 * "CMC - Custo da Mercadoria Comprada" = compras lançadas (uma linha por
 * conta ao expandir). "CMV - Custo da Mercadoria Vendida" = EI + CMC - EF,
 * com o detalhe de estoque ao expandir; enquanto o estoque final do mês não
 * for informado o CMV é provisório (EI + CMC) e o estoque final mostra "-". */
function linhasCmv(dre: Dre): LinhaDreMensal[] {
  const cmv = dre.cmv;
  const final = (v: number) => (cmv.provisorio ? null : v);
  return [
    {
      id: "cmc",
      rotulo: "CMC - Custo da Mercadoria Comprada",
      nivel: 0,
      valor: cmv.cmc,
      filhos: dre.contasCmc.map((c) => ({ id: c.id, rotulo: c.nome, nivel: 1, valor: c.valor })),
    },
    {
      id: "cmv",
      rotulo: "CMV - Custo da Mercadoria Vendida",
      nivel: 0,
      valor: cmv.total,
      filhos: [
        { id: "cmv_estoque_inicial_merc", rotulo: "Estoque inicial de Mercadorias", nivel: 1, valor: cmv.estoqueInicialMercadorias },
        { id: "cmv_estoque_inicial_emb", rotulo: "Estoque inicial de Embalagens", nivel: 1, valor: cmv.estoqueInicialEmbalagens },
        { id: "cmv_cmc", rotulo: "(+) CMC", nivel: 1, valor: cmv.cmc },
        { id: "cmv_estoque_final_merc", rotulo: "(-) Estoque final de Mercadorias", nivel: 1, valor: final(cmv.estoqueFinalMercadorias) },
        { id: "cmv_estoque_final_emb", rotulo: "(-) Estoque final de Embalagens", nivel: 1, valor: final(cmv.estoqueFinalEmbalagens) },
      ],
    },
  ];
}

/** Árvore de um único mês com nomes e ordem da Planilha Financeiro da Zatti
 * (V1 de 25/09), pronta pra combinar com os outros 11 meses do ano
 * (`dre-anual.ts`). Só apresentação: todo valor vem de `calcularDre`.
 * "Custos Fixos" é o subtotal de CMO + Custos Operacionais (igual à
 * planilha, que mostra Custos Fixos e logo depois os blocos que o compõem).
 * "Resultado Operacional" saiu: tinha o mesmo cálculo do Resultado Líquido do
 * Exercício. Resultado Econômico fica (cálculo diferente: Resultado Líquido
 * menos Saídas não Operacionais). */
export function montarArvoreMensal(dre: Dre): LinhaDreMensal[] {
  const receitaLiquida = somarValores([dre.receitas.total, -dre.deducoes.total]);
  const custosFixos = somarValores([dre.cmo.total, dre.custosOperacionais.total]);

  return [
    {
      id: "receita_bruta",
      rotulo: "Receita Operacional Bruta",
      nivel: 0,
      valor: dre.receitas.total,
      filhos: [...linhasSubgrupos(dre.receitas.subgrupos, 1, 2), ...linhasContas(dre.receitas.contas, 1)],
    },
    { id: "deducoes", rotulo: "Deduções", nivel: 0, valor: dre.deducoes.total, filhos: linhasSubgrupos(dre.deducoes.subgrupos, 1, 2) },
    { id: "receita_liquida", rotulo: "Receita Operacional Líquida", nivel: 0, valor: receitaLiquida, destaque: true },
    ...linhasCmv(dre),
    { id: "margem", rotulo: "Resultado Operacional Bruto", nivel: 0, valor: dre.margemContribuicao, destaque: true },
    { id: "custos_fixos", rotulo: "Custos Fixos", nivel: 0, valor: custosFixos, destaque: true },
    {
      id: "cmo",
      rotulo: "Custo com Mão de Obra (CMO)",
      nivel: 0,
      valor: dre.cmo.total,
      filhos: [...linhasContas(dre.cmo.contas, 1), ...linhasSubgrupos([dre.cmo.provisionamento], 1, 2)],
    },
    {
      id: "custos_operacionais",
      rotulo: "Custos Operacionais",
      nivel: 0,
      valor: dre.custosOperacionais.total,
      filhos: linhasSubgrupos(dre.custosOperacionais.subgrupos, 1, 2),
    },
    { id: "resultado_liquido", rotulo: "Resultado Líquido do Exercício", nivel: 0, valor: dre.resultadoOperacional, destaque: true },
    {
      id: "saidas",
      rotulo: "Saídas não Operacionais",
      nivel: 0,
      valor: dre.saidasNaoOperacionais.total,
      filhos: linhasContas(dre.saidasNaoOperacionais.contas, 1),
    },
    { id: "resultado_economico", rotulo: "Resultado Econômico", nivel: 0, valor: dre.geracaoCaixaAposSaidas, destaque: true },
  ];
}
