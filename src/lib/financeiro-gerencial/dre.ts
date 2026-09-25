import { somarValores } from "./parcelas";
import type { CategoriaFinanceira, EstoqueMensal, Lancamento, LancamentoBase, PapelDre } from "./tipos";

/** O mínimo de um lançamento que a DRE lê - aceita tanto `Lancamento` quanto
 * `LancamentoBase` (carga completa da unidade). */
export type LancamentoDre = Pick<Lancamento, "categoriaId" | "dataCompetencia" | "origem"> & { parcelas: { valor: number }[] };

export type ContaValorDre = { id: string; nome: string; valor: number };

export type SubgrupoDre = { id: string; nome: string; contas: ContaValorDre[]; total: number };

/** A DRE sempre calcula com o que tiver lançado (regra de 25/09). `provisorio`
 * = estoque final do mês ainda não informado: CMV = EI + CMC, sem descontar
 * o estoque final - a tela avisa e mostra % CMC em vez de % CMV. */
export type CmvCalculado = {
  provisorio: boolean;
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
  /** Receita de entregas (Entrega iFood, Entrega 99, Entrega app próprio -
   * contas com `codigo_sistema` terminando em "_entrega"). Entrega não é
   * venda de produto: sai do denominador do % CMC provisório. */
  receitaEntregas: number;
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
  cmo: { contas: ContaValorDre[]; provisionamento: SubgrupoDre; total: number };
  custosOperacionais: { subgrupos: SubgrupoDre[]; total: number };
  resultadoOperacional: number;
  saidasNaoOperacionais: { contas: ContaValorDre[]; total: number };
  geracaoCaixaAposSaidas: number;
};

/** Visões da DRE (V1, 25/09 - regra de Vinícius): pagamento NUNCA define
 * o que é realizado (pago/parcial/aberto/vencido são estados de caixa, não
 * da DRE). O que separa realizado de previsto é a Data de Competência:
 * - Realizada: fatos econômicos com competência até hoje (já aconteceram),
 *   pagos ou não;
 * - Projetada: competência depois de hoje (ainda previstos - ocorrências
 *   futuras de recorrência, lançamento agendado);
 * - Completa: realizada + projetada.
 * Parcela cancelada nunca entra em nenhuma. Usa só colunas que já existem
 * (`data_competencia` e `status` da parcela) - sem migração. */
export type VisaoDre = "realizada" | "projetada" | "completa";

export function lancamentosDaVisao(visao: VisaoDre, lancamentos: LancamentoBase[], hoje: string): LancamentoBase[] {
  return lancamentos
    .filter((l) => visao === "completa" || (visao === "realizada" ? l.dataCompetencia <= hoje : l.dataCompetencia > hoje))
    .map((l) => ({ ...l, parcelas: l.parcelas.filter((p) => p.status !== "cancelado") }));
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

/** Conta de receita de entrega/taxa de entrega, sempre por `codigo_sistema`
 * (nunca por nome): receita_ifood_entrega, receita_99_entrega,
 * receita_app_proprio_entrega e qualquer código novo que termine em "_entrega". */
export function ehContaDeEntrega(categoria: CategoriaFinanceira): boolean {
  return !!categoria.codigoSistema && categoria.codigoSistema.endsWith("_entrega");
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
// Nomes e ordem da Planilha Financeiro da Zatti (bloco "Provisionamento").
const ROTULO_PROVISAO_CMO: Partial<Record<PapelDre, string>> = {
  cmo_decimo_terceiro: "Provisão 13º",
  cmo_ferias: "Provisão Férias",
  cmo_multa_fgts: "Provisão Multa FGTS",
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

/** Estoque "informado" = valor maior que zero. As colunas de
 * `fin_estoque_mensal` nascem com default 0 e a grade salva célula vazia
 * como 0, então zero é tratado como "não informado" (sem migração). */
function informado(v: number | undefined | null): v is number {
  return typeof v === "number" && v > 0;
}

/** CMV (regra final de Vinícius, 25/09):
 * - Estoque inicial de cada tipo: o informado no mês; senão o estoque final
 *   do mês anterior; senão zero.
 * - Fechado (estoque final de MERCADORIAS informado; embalagens zero é
 *   aceito como valor real, muita operação não controla embalagem):
 *   CMV = EI Merc + EI Emb + CMC - EF Merc - EF Emb.
 * - Provisório (falta estoque final): CMV = EI Merc + EI Emb + CMC. */
function calcularCmv(
  categorias: CategoriaFinanceira[],
  totais: Map<string, number>,
  estoqueDoMes: EstoqueMensal | null,
  estoqueMesAnterior: EstoqueMensal | null,
): CmvCalculado {
  const comprasMercadorias = somarValores(contasDoPapel(categorias, "cmc_mercadorias", totais).map((c) => c.valor));
  const comprasEmbalagens = somarValores(contasDoPapel(categorias, "cmc_embalagens", totais).map((c) => c.valor));
  const cmc = somarValores([comprasMercadorias, comprasEmbalagens]);

  const inicial = (doMes: number | undefined, finalAnterior: number | undefined) =>
    informado(doMes) ? doMes : informado(finalAnterior) ? finalAnterior : 0;
  const estoqueInicialMercadorias = inicial(estoqueDoMes?.estoqueInicialMercadorias, estoqueMesAnterior?.estoqueFinalMercadorias);
  const estoqueInicialEmbalagens = inicial(estoqueDoMes?.estoqueInicialEmbalagens, estoqueMesAnterior?.estoqueFinalEmbalagens);

  const fechado = informado(estoqueDoMes?.estoqueFinalMercadorias);
  const estoqueFinalMercadorias = fechado ? estoqueDoMes!.estoqueFinalMercadorias : 0;
  const estoqueFinalEmbalagens = fechado ? estoqueDoMes!.estoqueFinalEmbalagens : 0;

  return {
    provisorio: !fechado,
    estoqueInicialMercadorias,
    estoqueInicialEmbalagens,
    comprasMercadorias,
    comprasEmbalagens,
    cmc,
    estoqueFinalMercadorias,
    estoqueFinalEmbalagens,
    total: somarValores([estoqueInicialMercadorias, estoqueInicialEmbalagens, cmc, -estoqueFinalMercadorias, -estoqueFinalEmbalagens]),
  };
}

/** Motor de cálculo da DRE V1 - função pura, nunca decide bucket por nome de
 * texto (sempre via `papelDre`/`codigoSistema`). Sempre calcula com o que
 * tiver lançado: sem estoque final do mês o CMV fica provisório (`cmv.provisorio`). */
export function calcularDre(params: {
  competencia: string;
  lancamentos: LancamentoDre[];
  categorias: CategoriaFinanceira[];
  estoqueMensal: EstoqueMensal | null;
  /** Estoque do mês anterior - o estoque final dele é o estoque inicial
   * deste mês quando o inicial não foi informado. */
  estoqueMesAnterior?: EstoqueMensal | null;
  /** Valor do mês das 3 contas de provisão (id da categoria -> valor), de
   * `valoresDreProvisao` em provisoes.ts. Ausente = 0. */
  valoresProvisao?: Map<string, number>;
}): Dre {
  const { competencia, lancamentos, categorias, estoqueMensal, estoqueMesAnterior = null, valoresProvisao } = params;
  const totais = somarPorCategoria(lancamentos, competencia);
  for (const [categoriaId, valor] of valoresProvisao ?? []) totais.set(categoriaId, valor);

  const receitas = receitasPorSubgrupo(categorias, totais);
  const receitaEntregas = somarValores(
    categorias.filter((c) => c.nivel === "conta" && c.papelDre === "receita" && ehContaDeEntrega(c)).map((c) => totais.get(c.id) ?? 0),
  );

  const subgruposDeducoes = subgruposDaDeducoes(categorias, totais);
  const deducoes = { subgrupos: subgruposDeducoes, total: somarValores(subgruposDeducoes.map((s) => s.total)) };

  const cmv = calcularCmv(categorias, totais, estoqueMensal, estoqueMesAnterior);
  const papeisCmc: PapelDre[] = ["cmc_mercadorias", "cmc_embalagens"];
  const contasCmc = categorias
    .filter((c) => c.nivel === "conta" && c.papelDre && papeisCmc.includes(c.papelDre))
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({ id: c.id, nome: c.nome, valor: totais.get(c.id) ?? 0 }));
  const margemContribuicao = somarValores([receitas.total, -deducoes.total, -cmv.total]);

  const contasPagamentoCmo = contasDoPapel(categorias, "cmo", totais);
  const contasProvisaoCmo = (["cmo_decimo_terceiro", "cmo_ferias", "cmo_multa_fgts"] as PapelDre[]).flatMap((papel) =>
    contasDoPapel(categorias, papel, totais).map((c) => ({ ...c, nome: ROTULO_PROVISAO_CMO[papel] ?? c.nome })),
  );
  const provisionamento: SubgrupoDre = {
    id: "cmo_provisionamento",
    nome: "Provisionamento",
    contas: contasProvisaoCmo,
    total: somarValores(contasProvisaoCmo.map((c) => c.valor)),
  };
  const totalPagamentosCmo = somarValores(contasPagamentoCmo.map((c) => c.valor));
  const cmo = { contas: contasPagamentoCmo, provisionamento, total: somarValores([totalPagamentosCmo, provisionamento.total]) };

  const subgruposCustos = subgruposDeCustosOperacionais(categorias, totais);
  const custosOperacionais = { subgrupos: subgruposCustos, total: somarValores(subgruposCustos.map((s) => s.total)) };

  const resultadoOperacional = somarValores([margemContribuicao, -cmo.total, -custosOperacionais.total]);

  const contasSaidas = contasDoPapel(categorias, "saida_nao_operacional", totais);
  const saidasNaoOperacionais = { contas: contasSaidas, total: somarValores(contasSaidas.map((c) => c.valor)) };

  const geracaoCaixaAposSaidas = somarValores([resultadoOperacional, -saidasNaoOperacionais.total]);

  return {
    competencia,
    receitas,
    receitaEntregas,
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
