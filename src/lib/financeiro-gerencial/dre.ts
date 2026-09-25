import { somarValores } from "./parcelas";
import type { VisaoCaixa } from "./caixa";
import type { BaixaBase, CategoriaFinanceira, EstoqueMensal, Lancamento, LancamentoBase, PapelDre } from "./tipos";

/** O mínimo de um lançamento que a DRE lê - aceita tanto `Lancamento` quanto
 * `LancamentoBase` (carga completa da unidade). */
export type LancamentoDre = Pick<Lancamento, "categoriaId" | "dataCompetencia" | "origem"> & { parcelas: { valor: number }[] };

export type ContaValorDre = { id: string; nome: string; valor: number };

export type SubgrupoDre = { id: string; nome: string; contas: ContaValorDre[]; total: number };

/** Regra de Vinícius (25/09): a DRE sempre calcula com o que tiver lançado.
 * Sem inventário do mês cadastrado, os estoques valem 0 (na prática CMV =
 * compras do CMC) e `semInventario` fica true pra tela avisar - nunca trava
 * Margem nem Resultados. */
export type CmvCalculado = {
  semInventario: boolean;
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
  /** `subgrupos` = Receitas da Loja/de Delivery/Outras Receitas; `contas` =
   * contas de receita fora desses subgrupos (ex: conta própria criada
   * direto no grupo). `total` soma tudo
   * que tem papel `receita`, igual antes da divisão em subgrupos. */
  receitas: { subgrupos: SubgrupoDre[]; contas: ContaValorDre[]; total: number };
  deducoes: { subgrupos: SubgrupoDre[]; total: number };
  cmv: CmvCalculado;
  /** Contas do CMC (mercadorias e embalagens) na ordem do plano de contas,
   * sempre presentes (mesmo sem estoque cadastrado) pra árvore da DRE ter a
   * mesma forma todo mês - o valor só é exibido quando `cmv` existe. */
  contasCmc: ContaValorDre[];
  margemContribuicao: number;
  /** Dois subgrupos fixos (25/09): "Pagamentos" (contas de CMO com
   * lançamento real) e "Provisões" (férias, 13º e multa do FGTS, valor vindo
   * do motor de Provisões - nunca do caixa). */
  cmo: { subgrupos: SubgrupoDre[]; total: number };
  custosOperacionais: { subgrupos: SubgrupoDre[]; total: number };
  resultadoOperacional: number;
  saidasNaoOperacionais: { contas: ContaValorDre[]; total: number };
  geracaoCaixaAposSaidas: number;
};

/** DRE Projetada ou Realizada (pedido de 25/09), com a mesma regra de status
 * do Fluxo de Caixa/DFC (`montarMovimentosCaixa`), mas sempre no regime de
 * competência (cada lançamento continua no mês da Data de Competência):
 * - Projetado: toda parcela não cancelada, pelo valor cheio.
 * - Realizado: só o que já foi recebido/pago - o valor de cada parcela vira
 *   a soma das baixas dela (estorno subtrai); parcela sem baixa vale 0.
 * Devolve a lista no mesmo formato, pronta pra `calcularDre`/provisões. */
export function lancamentosDaVisao(visao: VisaoCaixa, lancamentos: LancamentoBase[], baixas: BaixaBase[]): LancamentoBase[] {
  if (visao === "projetado") {
    return lancamentos.map((l) => ({ ...l, parcelas: l.parcelas.filter((p) => p.status !== "cancelado") }));
  }
  const baixadoPorParcela = new Map<string, number>();
  for (const b of baixas) {
    const valor = b.tipo === "estorno" ? -b.valor : b.valor;
    baixadoPorParcela.set(b.parcelaId, somarValores([baixadoPorParcela.get(b.parcelaId) ?? 0, valor]));
  }
  return lancamentos.map((l) => ({
    ...l,
    parcelas: l.parcelas.map((p) => ({ ...p, valor: baixadoPorParcela.get(p.id) ?? 0 })),
  }));
}

/** Soma, por conta-folha, o valor de todos os lançamentos cuja competência
 * cai no mês pedido - por Data de Competência, independente de a parcela
 * estar recebida/paga (regra explícita da DRE). O valor de cada lançamento é
 * a soma de todas as suas parcelas (parcelamento não fragmenta o fato
 * econômico entre meses, só o cronograma de caixa). */
function somarPorCategoria(lancamentos: LancamentoDre[], competencia: string): Map<string, number> {
  const totais = new Map<string, number>();
  for (const lancamento of lancamentos) {
    if (!lancamento.dataCompetencia.startsWith(competencia)) continue;
    // Liquidação de provisão (guia paga) nunca entra na DRE - a linha da
    // conta de provisão vem do motor de Provisões (`valoresProvisao`).
    if (lancamento.origem === "liquidacao_provisao") continue;
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

const SUBGRUPOS_RECEITA = ["receitas_loja", "receitas_delivery", "outras_receitas"];

function receitasPorSubgrupo(categorias: CategoriaFinanceira[], totais: Map<string, number>): Dre["receitas"] {
  const todas = contasDoPapel(categorias, "receita", totais);
  const subgrupos = categorias
    .filter((c) => c.nivel === "subgrupo" && c.codigoSistema && SUBGRUPOS_RECEITA.includes(c.codigoSistema))
    .sort((a, b) => a.ordem - b.ordem);
  const idsSubgrupos = new Set(subgrupos.map((sg) => sg.id));
  const paiPorId = new Map(categorias.map((c) => [c.id, c.parentId]));
  const linhasSubgrupos = subgrupos.map((sg) => {
    const contas = todas.filter((c) => paiPorId.get(c.id) === sg.id);
    return { id: sg.id, nome: sg.nome, contas, total: somarValores(contas.map((c) => c.valor)) };
  });
  const contasDiretas = todas.filter((c) => !idsSubgrupos.has(paiPorId.get(c.id) ?? ""));
  return { subgrupos: linhasSubgrupos, contas: contasDiretas, total: somarValores(todas.map((c) => c.valor)) };
}

/** Nome da linha de provisão na DRE (INSS não tem provisão). */
const ROTULO_PROVISAO_CMO: Partial<Record<PapelDre, string>> = {
  cmo_ferias: "Provisão de férias",
  cmo_decimo_terceiro: "Provisão de 13º",
  cmo_multa_fgts: "Provisão de multa do FGTS",
};

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

const ESTOQUE_ZERADO = { estoqueInicialMercadorias: 0, estoqueInicialEmbalagens: 0, estoqueFinalMercadorias: 0, estoqueFinalEmbalagens: 0 };

function calcularCmv(categorias: CategoriaFinanceira[], totais: Map<string, number>, estoqueInformado: EstoqueMensal | null): CmvCalculado {
  const estoqueMensal = estoqueInformado ?? ESTOQUE_ZERADO;

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
    semInventario: estoqueInformado === null,
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
 * texto (sempre via `papelDre`/`codigoSistema`). Sempre calcula com o que
 * tiver lançado: sem inventário do mês, CMV = compras (`cmv.semInventario`). */
export function calcularDre(params: {
  competencia: string;
  lancamentos: LancamentoDre[];
  categorias: CategoriaFinanceira[];
  estoqueMensal: EstoqueMensal | null;
  /** Valor do mês das 3 contas de provisão (id da categoria -> valor), de
   * `valoresDreProvisao` em provisoes.ts. Ausente = 0. */
  valoresProvisao?: Map<string, number>;
}): Dre {
  const { competencia, lancamentos, categorias, estoqueMensal, valoresProvisao } = params;
  const totais = somarPorCategoria(lancamentos, competencia);
  for (const [categoriaId, valor] of valoresProvisao ?? []) totais.set(categoriaId, valor);

  const receitas = receitasPorSubgrupo(categorias, totais);

  const subgruposDeducoes = subgruposDaDeducoes(categorias, totais);
  const deducoes = { subgrupos: subgruposDeducoes, total: somarValores(subgruposDeducoes.map((s) => s.total)) };

  const cmv = calcularCmv(categorias, totais, estoqueMensal);
  const papeisCmc: PapelDre[] = ["cmc_mercadorias", "cmc_embalagens"];
  const contasCmc = categorias
    .filter((c) => c.nivel === "conta" && c.papelDre && papeisCmc.includes(c.papelDre))
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({ id: c.id, nome: c.nome, valor: totais.get(c.id) ?? 0 }));
  const margemContribuicao = somarValores([receitas.total, -deducoes.total, -cmv.total]);

  const contasPagamentoCmo = contasDoPapel(categorias, "cmo", totais);
  const contasProvisaoCmo = (["cmo_ferias", "cmo_decimo_terceiro", "cmo_multa_fgts"] as PapelDre[]).flatMap((papel) =>
    contasDoPapel(categorias, papel, totais).map((c) => ({ ...c, nome: ROTULO_PROVISAO_CMO[papel] ?? c.nome })),
  );
  const subgruposCmo: SubgrupoDre[] = [
    { id: "cmo_pagamentos", nome: "Pagamentos", contas: contasPagamentoCmo, total: somarValores(contasPagamentoCmo.map((c) => c.valor)) },
    { id: "cmo_provisoes", nome: "Provisões", contas: contasProvisaoCmo, total: somarValores(contasProvisaoCmo.map((c) => c.valor)) },
  ];
  const cmo = { subgrupos: subgruposCmo, total: somarValores(subgruposCmo.map((s) => s.total)) };

  const subgruposCustos = subgruposDeCustosOperacionais(categorias, totais);
  const custosOperacionais = { subgrupos: subgruposCustos, total: somarValores(subgruposCustos.map((s) => s.total)) };

  const resultadoOperacional = somarValores([margemContribuicao, -cmo.total, -custosOperacionais.total]);

  const contasSaidas = contasDoPapel(categorias, "saida_nao_operacional", totais);
  const saidasNaoOperacionais = { contas: contasSaidas, total: somarValores(contasSaidas.map((c) => c.valor)) };

  const geracaoCaixaAposSaidas = somarValores([resultadoOperacional, -saidasNaoOperacionais.total]);

  return {
    competencia,
    receitas,
    deducoes,
    cmv,
    contasCmc,
    margemContribuicao,
    cmo,
    custosOperacionais,
    resultadoOperacional,
    saidasNaoOperacionais,
    geracaoCaixaAposSaidas,
  };
}
