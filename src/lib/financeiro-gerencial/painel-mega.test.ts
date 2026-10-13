import { describe, expect, it } from "vitest";
import { calcularDre } from "./dre";
import { montarDreAnualDaUnidade } from "./dre-unidade";
import { montarQuadrosDre } from "./quadros-dre";
import { caixaProjetadoEmDias, calcularFarol, metaVigente, montarPainelMega, type MetaUnidade } from "./painel-mega";
import type { CategoriaFinanceira, ContaFinanceira, EstoqueMensal, LancamentoBase } from "./tipos";

function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return { parentId: null, nivel: "conta", papelDre: null, nome: over.id, codigoSistema: null, padrao: true, ordem: 1, arquivado: false, ...over };
}

const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "receita_salao", papelDre: "receita", nome: "Vendas no salão" }),
  categoria({ id: "sub_deducoes", nivel: "subgrupo", codigoSistema: "deducoes_da_receita", nome: "Deduções da Receita" }),
  categoria({ id: "deducao_impostos", parentId: "sub_deducoes", papelDre: "deducao_receita", nome: "Impostos" }),
  categoria({ id: "sub_cvv", nivel: "subgrupo", codigoSistema: "custos_venda_variaveis", nome: "Custos de Venda Variáveis", ordem: 2 }),
  categoria({ id: "cvv_adquirencia", parentId: "sub_cvv", papelDre: "custo_venda_variavel", codigoSistema: "cvv_adquirencia", nome: "Taxas" }),
  categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Compras de mercadorias" }),
  categoria({ id: "cmo_folha", papelDre: "cmo", nome: "Folha" }),
  categoria({ id: "cmo_freela", papelDre: "cmo", codigoSistema: "cmo_freelancers", nome: "Freelancers", ordem: 2 }),
  categoria({ id: "sub_ocupacao", nivel: "subgrupo", codigoSistema: "custos_ocupacao", nome: "Custos de Ocupação" }),
  categoria({ id: "co_aluguel", parentId: "sub_ocupacao", papelDre: "custo_ocupacao", nome: "Aluguel" }),
];

let seq = 0;
function lanc(
  tipo: "receita" | "despesa",
  categoriaId: string,
  dataCompetencia: string,
  valor: number,
  dataPrevista = dataCompetencia,
  status: "aberto" | "cancelado" = "aberto",
): LancamentoBase {
  const id = `l${++seq}`;
  return {
    id,
    tipo,
    descricao: "teste",
    origem: "comum",
    recorrenciaId: null,
    categoriaId,
    dataCompetencia,
    parcelas: [{ id: `${id}_p1`, valor, dataPrevista, contaFinanceiraId: "banco", status, numero: 1, totalParcelas: 1 }],
  } as LancamentoBase;
}

function estoque(competencia: string, over: Partial<EstoqueMensal> = {}): EstoqueMensal {
  return {
    id: `e_${competencia}`,
    competencia: `${competencia}-01`,
    receitaVendasProdutos: 0,
    estoqueInicialMercadorias: 0,
    estoqueInicialEmbalagens: 0,
    estoqueFinalMercadorias: 0,
    estoqueFinalEmbalagens: 0,
    criadoPorNome: "Gestão",
    atualizadoEm: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const LANCAMENTOS = [
  // Julho: mês anterior ainda sem inventário (CMV provisório) - ritmo com fração 1.
  lanc("despesa", "cmc_mercadorias", "2026-07-10", 5000),
  lanc("receita", "receita_salao", "2026-09-10", 20000),
  lanc("despesa", "deducao_impostos", "2026-09-10", 1000),
  lanc("despesa", "cmc_mercadorias", "2026-09-05", 7000),
  lanc("despesa", "cmo_folha", "2026-09-05", 4000),
  lanc("despesa", "co_aluguel", "2026-09-05", 3000),
  lanc("receita", "receita_salao", "2026-10-10", 15000),
  lanc("despesa", "cmc_mercadorias", "2026-10-05", 6000),
  lanc("despesa", "cmc_mercadorias", "2026-10-02", 500, "2026-10-02", "cancelado"), // fora da DRE e do ritmo
  lanc("despesa", "cmc_mercadorias", "2026-10-20", 1000), // depois de hoje: na DRE do mês, fora do ritmo
  lanc("despesa", "cvv_adquirencia", "2026-10-03", 800),
  lanc("despesa", "cmo_freela", "2026-10-05", 400),
];
// Setembro fechado (estoque final + Venda de Produtos); outubro sem estoque final (provisório).
const ESTOQUES = [estoque("2026-09", { estoqueInicialMercadorias: 2000, estoqueFinalMercadorias: 3000, receitaVendasProdutos: 19000 })];
const HOJE = new Date(2026, 9, 13);
const HOJE_ISO = "2026-10-13";

function dreDoAno() {
  return montarDreAnualDaUnidade({ ano: 2026, todosLancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoques: ESTOQUES, parametros: [], reversoes: [], hoje: HOJE });
}

const CAIXA = { data: "2026-11-12", saldo: 0 };

function painelDoMes(mesIndice: number, metas: MetaUnidade[]) {
  const { dreAnual, receitaVendasProdutosPorMes } = dreDoAno();
  return montarPainelMega({
    dreAnual,
    mesIndice,
    receitaVendasProdutosPorMes,
    metas,
    caixaProjetado30Dias: CAIXA,
    hoje: HOJE_ISO,
    lancamentos: LANCAMENTOS,
    categorias: CATEGORIAS,
  });
}

function meta(over: Partial<MetaUnidade> & { vigenteDesde: string }): MetaUnidade {
  return { faturamento: null, cmvPercentual: null, custoFixoPercentual: null, resultado: null, custosVariaveis: null, ...over };
}

describe("farol do Painel M.E.G.A.", () => {
  it("piso: cumpre com valor maior ou igual à meta", () => {
    expect(calcularFarol(100, 100, "piso")).toBe("cumpre");
    expect(calcularFarol(99.99, 100, "piso")).toBe("nao_cumpre");
  });
  it("teto: cumpre com valor menor ou igual à meta", () => {
    expect(calcularFarol(0.32, 0.32, "teto")).toBe("cumpre");
    expect(calcularFarol(0.33, 0.32, "teto")).toBe("nao_cumpre");
  });
  it("sem meta: sem cor; meta sem número no mês: sem valor", () => {
    expect(calcularFarol(100, null, "piso")).toBe("sem_meta");
    expect(calcularFarol(null, 100, "piso")).toBe("sem_valor");
  });
});

describe("vigência da meta", () => {
  const METAS: MetaUnidade[] = [
    meta({ vigenteDesde: "2026-08-01", faturamento: 10000, cmvPercentual: 0.35 }),
    meta({ vigenteDesde: "2026-10-01", faturamento: 30000, custoFixoPercentual: 0.3, resultado: 1000 }),
  ];
  it("vale a meta do próprio mês ou do mês anterior mais recente", () => {
    expect(metaVigente(METAS, "2026-09")?.faturamento).toBe(10000);
    expect(metaVigente(METAS, "2026-10")?.faturamento).toBe(30000);
    expect(metaVigente(METAS, "2026-12")?.vigenteDesde).toBe("2026-10-01");
  });
  it("mês antes da primeira meta: sem meta", () => {
    expect(metaVigente(METAS, "2026-07")).toBeNull();
  });
  it("meta nova não muda o farol do mês passado", () => {
    const setembro = painelDoMes(8, METAS);
    expect(setembro.metaVigenteDesde).toBe("2026-08-01");
    expect(setembro.faturamento).toEqual({ valor: 20000, meta: 10000, farol: "cumpre" });
    expect(setembro.custoFixoPercentual.farol).toBe("sem_meta");
  });
});

describe("Painel M.E.G.A. igual à DRE do mesmo mês", () => {
  it("setembro: cada número é o da DRE (calcularDre + quadro do Ponto de Equilíbrio)", () => {
    const { dreAnual } = dreDoAno();
    const painel = painelDoMes(8, []);
    const dre = calcularDre({
      competencia: "2026-09",
      lancamentos: LANCAMENTOS,
      categorias: CATEGORIAS,
      estoqueMensal: ESTOQUES[0],
      estoqueMesAnterior: null,
      estoqueMesSeguinte: null,
    });
    const custosFixos = dre.cmo.total + dre.custosOperacionais.total;
    expect(painel.faturamento.valor).toBe(dre.receitas.total);
    expect(painel.cmvPercentual.percentualCmvFechado).toBe(true);
    expect(painel.cmvPercentual.valor).toBeCloseTo(dre.cmv.total / 19000, 10);
    expect(painel.margemContribuicao.valor).toBe(dre.margemContribuicao);
    expect(painel.margemContribuicao.percentual).toBeCloseTo(dre.margemContribuicao / dre.receitas.total, 10);
    expect(painel.custoFixoPercentual.custosFixos).toBe(custosFixos);
    expect(painel.custoFixoPercentual.valor).toBeCloseTo(custosFixos / dre.receitas.total, 10);
    expect(painel.resultado.valor).toBe(dre.resultadoOperacional);
    expect(painel.pontoDeEquilibrio).toEqual(montarQuadrosDre(dreAnual.linhas, 8).pontoDeEquilibrio.atual);
    // Valores concretos, para o teste não passar com as duas pontas erradas.
    expect(dre.cmv.total).toBe(6000); // 2000 + 7000 - 3000
    expect(painel.resultado.valor).toBe(20000 - 1000 - 6000 - 4000 - 3000);
  });

  it("CMV provisório: o painel mostra o % CMC da DRE e o farol de CMV fica sem cor", () => {
    const { dreAnual } = dreDoAno();
    const outubro = painelDoMes(9, [meta({ vigenteDesde: "2026-01-01", cmvPercentual: 0.5 })]);
    expect(outubro.cmvPercentual.percentualCmvFechado).toBe(false);
    expect(outubro.cmvPercentual.valor).toBe(dreAnual.linhas.find((l) => l.id === "cmv_percentual")?.valoresPorMes[9]);
    expect(outubro.cmvPercentual.farol).toBe("provisorio");
  });

  it("CMV provisório com todas as metas preenchidas: nenhum indicador da DRE ganha farol", () => {
    // Metas que outubro "cumpriria" (faturamento, resultado) e "não cumpriria" (% custos fixos): nenhuma vira cor.
    const outubro = painelDoMes(9, [meta({ vigenteDesde: "2026-01-01", faturamento: 1000, cmvPercentual: 0.9, custoFixoPercentual: -1, resultado: -100000 })]);
    expect(outubro.cmvPercentual.percentualCmvFechado).toBe(false);
    expect(outubro.faturamento).toEqual({ valor: 15000, meta: 1000, farol: "provisorio" });
    expect(outubro.cmvPercentual.farol).toBe("provisorio");
    expect(outubro.custoFixoPercentual.farol).toBe("provisorio");
    expect(outubro.resultado.farol).toBe("provisorio");
    // As metas continuam visíveis no texto, só sem cor.
    expect(outubro.resultado.meta).toBe(-100000);
  });

  it("CMV provisório sem meta num indicador: continua sem meta (convite para definir)", () => {
    const outubro = painelDoMes(9, [meta({ vigenteDesde: "2026-01-01", faturamento: 1000 })]);
    expect(outubro.faturamento.farol).toBe("provisorio");
    expect(outubro.resultado.farol).toBe("sem_meta");
  });

  it("mês fechado com as mesmas metas: o farol volta a colorir", () => {
    const setembro = painelDoMes(8, [meta({ vigenteDesde: "2026-01-01", faturamento: 1000, cmvPercentual: 0.9, custoFixoPercentual: 0.01, resultado: -100000 })]);
    expect(setembro.faturamento.farol).toBe("cumpre");
    expect(setembro.cmvPercentual.farol).toBe("cumpre");
    expect(setembro.custoFixoPercentual.farol).toBe("nao_cumpre");
    expect(setembro.resultado.farol).toBe("cumpre");
  });

  it("caixa projetado em 30 dias = saldo do fluxo projetado, todas as contas", () => {
    const contas: ContaFinanceira[] = [{ id: "banco", nome: "Banco", tipo: "banco", saldoInicial: 1000, dataSaldoInicial: "2026-01-01", ativo: true } as ContaFinanceira];
    const lancamentos = [lanc("receita", "receita_salao", "2026-10-01", 500, "2026-11-12"), lanc("despesa", "co_aluguel", "2026-10-01", 300, "2026-11-13")];
    expect(caixaProjetadoEmDias({ hoje: "2026-10-13", dias: 30, lancamentos, baixas: [], contas })).toEqual({ data: "2026-11-12", saldo: 1500 });
  });
});

describe("farol por ritmo no mês com CMV provisório (decisão 4 de 13/10)", () => {
  const METAS = [meta({ vigenteDesde: "2026-01-01", faturamento: 100000, cmvPercentual: 0.3, custosVariaveis: 2000 })];

  it("mês fechado (setembro): sem ritmo, vale o farol da DRE", () => {
    expect(painelDoMes(8, METAS).ritmo).toBeNull();
  });

  it("outubro no dia 13: compras até hoje por competência contra a meta proporcional (13/31)", () => {
    const outubro = painelDoMes(9, METAS);
    const { dreAnual } = dreDoAno();
    expect(outubro.ritmo).toMatchObject({ hoje: "2026-10-13", diasDecorridos: 13, diasDoMes: 31 });
    // A DRE do mês tem 7.000 (6.000 + 1.000 do dia 20); o ritmo só conta até hoje: 6.000.
    expect(dreAnual.linhas.find((l) => l.id === "cmc")?.valoresPorMes[9]).toBe(7000);
    expect(outubro.ritmo?.cmvCompras).toMatchObject({ realizado: 6000, metaDoMes: 30000, esperado: 12580.65, limiteVermelho: 15096.78, farol: "no_ritmo" });
    // Custos variáveis 800 + freelancer 400 = 1.200 contra 838,71 esperado: mais de 20% acima.
    expect(outubro.ritmo?.custosVariaveis).toMatchObject({ realizado: 1200, custosVendaVariaveis: 800, freelancers: 400, metaDoMes: 2000, esperado: 838.71, limiteVermelho: 1006.45, farol: "muito_acima_do_ritmo" });
    // Os indicadores da DRE seguem sem cor no mês provisório.
    expect(outubro.faturamento.farol).toBe("provisorio");
    expect(outubro.cmvPercentual.farol).toBe("provisorio");
  });

  it("mês anterior ainda sem inventário (julho): fração 1 e realizado = CMC da DRE do mês", () => {
    const julho = painelDoMes(6, METAS);
    const { dreAnual } = dreDoAno();
    expect(julho.cmvPercentual.percentualCmvFechado).toBe(false);
    expect(julho.ritmo).toMatchObject({ diasDecorridos: 31, diasDoMes: 31, fracao: 1 });
    expect(julho.ritmo?.cmvCompras.realizado).toBe(dreAnual.linhas.find((l) => l.id === "cmc")?.valoresPorMes[6]);
    expect(julho.ritmo?.cmvCompras).toMatchObject({ realizado: 5000, esperado: 30000, farol: "no_ritmo" });
    expect(julho.ritmo?.custosVariaveis).toMatchObject({ realizado: 0, esperado: 2000, farol: "no_ritmo" });
  });

  it("sem meta cadastrada: ritmo sem cor; meta só de faturamento também não basta para o CMV", () => {
    const semMeta = painelDoMes(9, []);
    expect(semMeta.ritmo?.cmvCompras).toMatchObject({ realizado: 6000, metaDoMes: null, farol: "sem_meta" });
    expect(semMeta.ritmo?.custosVariaveis).toMatchObject({ realizado: 1200, metaDoMes: null, farol: "sem_meta" });
    const soFaturamento = painelDoMes(9, [meta({ vigenteDesde: "2026-01-01", faturamento: 100000 })]);
    expect(soFaturamento.ritmo?.cmvCompras.farol).toBe("sem_meta");
  });

  it("meta vigente por mês: a meta de novembro não muda o ritmo de outubro", () => {
    const outubro = painelDoMes(9, [...METAS, meta({ vigenteDesde: "2026-11-01", faturamento: 10000, cmvPercentual: 0.1, custosVariaveis: 100 })]);
    expect(outubro.ritmo?.cmvCompras.metaDoMes).toBe(30000);
    expect(outubro.ritmo?.custosVariaveis.metaDoMes).toBe(2000);
  });

  it("mês futuro (novembro): sem ritmo, mesmo com meta", () => {
    const novembro = painelDoMes(10, METAS);
    expect(novembro.previsao).toBe(true);
    expect(novembro.ritmo).toMatchObject({ diasDecorridos: 0, fracao: 0 });
    expect(novembro.ritmo?.cmvCompras).toMatchObject({ realizado: 0, farol: "mes_nao_comecou" });
  });
});
