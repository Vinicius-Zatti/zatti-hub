import { somarValores } from "./parcelas";
import type { CategoriaFinanceira, EstoqueMensal, Lancamento, PapelDre } from "./tipos";

export type ContaValorDre = { id: string; nome: string; valor: number };

export type SubgrupoDre = { id: string; nome: string; contas: ContaValorDre[]; total: number };

/** `null` quando o estoque mensal da competência ainda não foi cadastrado -
 * a DRE nunca finge que estoque não informado vale 0 (isso inflaria o CMV
 * de forma silenciosa e errada). */
export type CmvCalculado = {
  estoqueInicialMercadorias: number;
  estoqueInicialEmbalagens: number;
  comprasMercadorias: number;
  comprasEmbalagens: number;
  cmc: number;
  estoqueFinalMercadorias: number;
  estoqueFinalEmbalagens: number;
  total: number;
};

export type Dre = {
  competencia: string;
  receitas: { contas: ContaValorDre[]; total: number };
  deducoes: { subgrupos: SubgrupoDre[]; total: number };
  cmv: CmvCalculado | null;
  margemContribuicao: number | null;
  cmo: { contas: ContaValorDre[]; total: number };
  custosOperacionais: { subgrupos: SubgrupoDre[]; total: number };
  resultadoOperacional: number | null;
  saidasNaoOperacionais: { contas: ContaValorDre[]; total: number };
  geracaoCaixaAposSaidas: number | null;
};

/** Soma, por conta-folha, o valor de todos os lançamentos cuja competência
 * cai no mês pedido - por Data de Competência, independente de a parcela
 * estar recebida/paga (regra explícita da DRE). O valor de cada lançamento é
 * a soma de todas as suas parcelas (parcelamento não fragmenta o fato
 * econômico entre meses, só o cronograma de caixa). */
function somarPorCategoria(lancamentos: Lancamento[], competencia: string): Map<string, number> {
  const totais = new Map<string, number>();
  for (const lancamento of lancamentos) {
    if (!lancamento.dataCompetencia.startsWith(competencia)) continue;
    const valor = somarValores(lancamento.parcelas.map((p) => p.valor));
    totais.set(lancamento.categoriaId, (totais.get(lancamento.categoriaId) ?? 0) + valor);
  }
  return totais;
}

function contasDoPapel(categorias: CategoriaFinanceira[], papel: PapelDre, totais: Map<string, number>): ContaValorDre[] {
  return categorias
    .filter((c) => c.nivel === "conta" && c.papelDre === papel)
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({ id: c.id, nome: c.nome, valor: totais.get(c.id) ?? 0 }));
}

function subgruposDaDeducoes(categorias: CategoriaFinanceira[], totais: Map<string, number>): SubgrupoDre[] {
  const subgrupos = categorias.filter((c) => c.nivel === "subgrupo" && (c.codigoSistema === "deducoes_da_receita" || c.codigoSistema === "custos_venda_variaveis"));
  const papelPorCodigo: Record<string, PapelDre> = {
    deducoes_da_receita: "deducao_receita",
    custos_venda_variaveis: "custo_venda_variavel",
  };
  return subgrupos
    .sort((a, b) => a.ordem - b.ordem)
    .map((sg) => {
      const papel = papelPorCodigo[sg.codigoSistema ?? ""];
      const contas = papel ? contasDoPapel(categorias, papel, totais) : [];
      return { id: sg.id, nome: sg.nome, contas, total: somarValores(contas.map((c) => c.valor)) };
    });
}

const SUBGRUPOS_CUSTOS_OPERACIONAIS: Record<string, PapelDre> = {
  custos_ocupacao: "custo_ocupacao",
  custos_administrativos: "custo_administrativo",
  custos_comerciais: "custo_comercial",
  custos_venda_fixos: "custo_venda_fixo",
};

function subgruposDeCustosOperacionais(categorias: CategoriaFinanceira[], totais: Map<string, number>): SubgrupoDre[] {
  return categorias
    .filter((c) => c.nivel === "subgrupo" && c.codigoSistema && c.codigoSistema in SUBGRUPOS_CUSTOS_OPERACIONAIS)
    .sort((a, b) => a.ordem - b.ordem)
    .map((sg) => {
      const papel = SUBGRUPOS_CUSTOS_OPERACIONAIS[sg.codigoSistema as string];
      const contas = contasDoPapel(categorias, papel, totais);
      return { id: sg.id, nome: sg.nome, contas, total: somarValores(contas.map((c) => c.valor)) };
    });
}

function calcularCmv(categorias: CategoriaFinanceira[], totais: Map<string, number>, estoqueMensal: EstoqueMensal | null): CmvCalculado | null {
  if (!estoqueMensal) return null;

  const comprasMercadorias = somarValores(contasDoPapel(categorias, "cmc_mercadorias", totais).map((c) => c.valor));
  const comprasEmbalagens = somarValores(contasDoPapel(categorias, "cmc_embalagens", totais).map((c) => c.valor));
  const cmc = somarValores([comprasMercadorias, comprasEmbalagens]);

  const total = somarValores([
    estoqueMensal.estoqueInicialMercadorias,
    estoqueMensal.estoqueInicialEmbalagens,
    comprasMercadorias,
    comprasEmbalagens,
    -estoqueMensal.estoqueFinalMercadorias,
    -estoqueMensal.estoqueFinalEmbalagens,
  ]);

  return {
    estoqueInicialMercadorias: estoqueMensal.estoqueInicialMercadorias,
    estoqueInicialEmbalagens: estoqueMensal.estoqueInicialEmbalagens,
    comprasMercadorias,
    comprasEmbalagens,
    cmc,
    estoqueFinalMercadorias: estoqueMensal.estoqueFinalMercadorias,
    estoqueFinalEmbalagens: estoqueMensal.estoqueFinalEmbalagens,
    total,
  };
}

/** Motor de cálculo da DRE V1 - função pura, nunca decide bucket por nome de
 * texto (sempre via `papelDre`/`codigoSistema`). CMV e tudo que depende dele
 * (Margem de Contribuição, Resultado Operacional, Geração de Caixa) vem
 * `null` quando o estoque mensal da competência não foi cadastrado - nunca
 * calculado com estoque assumido em 0. */
export function calcularDre(params: {
  competencia: string;
  lancamentos: Lancamento[];
  categorias: CategoriaFinanceira[];
  estoqueMensal: EstoqueMensal | null;
}): Dre {
  const { competencia, lancamentos, categorias, estoqueMensal } = params;
  const totais = somarPorCategoria(lancamentos, competencia);

  const contasReceita = contasDoPapel(categorias, "receita", totais);
  const receitas = { contas: contasReceita, total: somarValores(contasReceita.map((c) => c.valor)) };

  const subgruposDeducoes = subgruposDaDeducoes(categorias, totais);
  const deducoes = { subgrupos: subgruposDeducoes, total: somarValores(subgruposDeducoes.map((s) => s.total)) };

  const cmv = calcularCmv(categorias, totais, estoqueMensal);
  const margemContribuicao = cmv ? somarValores([receitas.total, -deducoes.total, -cmv.total]) : null;

  const papeisCmo: PapelDre[] = ["cmo", "cmo_ferias", "cmo_decimo_terceiro", "cmo_multa_fgts"];
  const contasCmo = categorias
    .filter((c) => c.nivel === "conta" && c.papelDre && papeisCmo.includes(c.papelDre))
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({ id: c.id, nome: c.nome, valor: totais.get(c.id) ?? 0 }));
  const cmo = { contas: contasCmo, total: somarValores(contasCmo.map((c) => c.valor)) };

  const subgruposCustos = subgruposDeCustosOperacionais(categorias, totais);
  const custosOperacionais = { subgrupos: subgruposCustos, total: somarValores(subgruposCustos.map((s) => s.total)) };

  const resultadoOperacional =
    margemContribuicao === null ? null : somarValores([margemContribuicao, -cmo.total, -custosOperacionais.total]);

  const contasSaidas = contasDoPapel(categorias, "saida_nao_operacional", totais);
  const saidasNaoOperacionais = { contas: contasSaidas, total: somarValores(contasSaidas.map((c) => c.valor)) };

  const geracaoCaixaAposSaidas =
    resultadoOperacional === null ? null : somarValores([resultadoOperacional, -saidasNaoOperacionais.total]);

  return {
    competencia,
    receitas,
    deducoes,
    cmv,
    margemContribuicao,
    cmo,
    custosOperacionais,
    resultadoOperacional,
    saidasNaoOperacionais,
    geracaoCaixaAposSaidas,
  };
}
