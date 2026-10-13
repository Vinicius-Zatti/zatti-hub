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
  categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Compras de mercadorias" }),
  categoria({ id: "cmo_folha", papelDre: "cmo", nome: "Folha" }),
  categoria({ id: "sub_ocupacao", nivel: "subgrupo", codigoSistema: "custos_ocupacao", nome: "Custos de Ocupação" }),
  categoria({ id: "co_aluguel", parentId: "sub_ocupacao", papelDre: "custo_ocupacao", nome: "Aluguel" }),
];

let seq = 0;
function lanc(tipo: "receita" | "despesa", categoriaId: string, dataCompetencia: string, valor: number, dataPrevista = dataCompetencia): LancamentoBase {
  const id = `l${++seq}`;
  return {
    id,
    tipo,
    descricao: "teste",
    origem: "comum",
    recorrenciaId: null,
    categoriaId,
    dataCompetencia,
    parcelas: [{ id: `${id}_p1`, valor, dataPrevista, contaFinanceiraId: "banco", status: "aberto", numero: 1, totalParcelas: 1 }],
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
  lanc("receita", "receita_salao", "2026-09-10", 20000),
  lanc("despesa", "deducao_impostos", "2026-09-10", 1000),
  lanc("despesa", "cmc_mercadorias", "2026-09-05", 7000),
  lanc("despesa", "cmo_folha", "2026-09-05", 4000),
  lanc("despesa", "co_aluguel", "2026-09-05", 3000),
  lanc("receita", "receita_salao", "2026-10-10", 15000),
  lanc("despesa", "cmc_mercadorias", "2026-10-05", 6000),
];
// Setembro fechado (estoque final + Venda de Produtos); outubro sem estoque final (provisório).
const ESTOQUES = [estoque("2026-09", { estoqueInicialMercadorias: 2000, estoqueFinalMercadorias: 3000, receitaVendasProdutos: 19000 })];
const HOJE = new Date(2026, 9, 13);

function dreDoAno() {
  return montarDreAnualDaUnidade({ ano: 2026, todosLancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoques: ESTOQUES, parametros: [], reversoes: [], hoje: HOJE });
}

const CAIXA = { data: "2026-11-12", saldo: 0 };

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
    { vigenteDesde: "2026-08-01", faturamento: 10000, cmvPercentual: 0.35, custoFixoPercentual: null, resultado: null },
    { vigenteDesde: "2026-10-01", faturamento: 30000, cmvPercentual: null, custoFixoPercentual: 0.3, resultado: 1000 },
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
    const { dreAnual, receitaVendasProdutosPorMes } = dreDoAno();
    const setembro = montarPainelMega({ dreAnual, mesIndice: 8, receitaVendasProdutosPorMes, metas: METAS, caixaProjetado30Dias: CAIXA });
    expect(setembro.metaVigenteDesde).toBe("2026-08-01");
    expect(setembro.faturamento).toEqual({ valor: 20000, meta: 10000, farol: "cumpre" });
    expect(setembro.custoFixoPercentual.farol).toBe("sem_meta");
  });
});

describe("Painel M.E.G.A. igual à DRE do mesmo mês", () => {
  it("setembro: cada número é o da DRE (calcularDre + quadro do Ponto de Equilíbrio)", () => {
    const { dreAnual, receitaVendasProdutosPorMes } = dreDoAno();
    const painel = montarPainelMega({ dreAnual, mesIndice: 8, receitaVendasProdutosPorMes, metas: [], caixaProjetado30Dias: CAIXA });
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
    const { dreAnual, receitaVendasProdutosPorMes } = dreDoAno();
    const metas: MetaUnidade[] = [{ vigenteDesde: "2026-01-01", faturamento: null, cmvPercentual: 0.5, custoFixoPercentual: null, resultado: null }];
    const outubro = montarPainelMega({ dreAnual, mesIndice: 9, receitaVendasProdutosPorMes, metas, caixaProjetado30Dias: CAIXA });
    expect(outubro.cmvPercentual.percentualCmvFechado).toBe(false);
    expect(outubro.cmvPercentual.valor).toBe(dreAnual.linhas.find((l) => l.id === "cmv_percentual")?.valoresPorMes[9]);
    expect(outubro.cmvPercentual.farol).toBe("provisorio");
  });

  it("caixa projetado em 30 dias = saldo do fluxo projetado, todas as contas", () => {
    const contas: ContaFinanceira[] = [{ id: "banco", nome: "Banco", tipo: "banco", saldoInicial: 1000, dataSaldoInicial: "2026-01-01", ativo: true } as ContaFinanceira];
    const lancamentos = [lanc("receita", "receita_salao", "2026-10-01", 500, "2026-11-12"), lanc("despesa", "co_aluguel", "2026-10-01", 300, "2026-11-13")];
    expect(caixaProjetadoEmDias({ hoje: "2026-10-13", dias: 30, lancamentos, baixas: [], contas })).toEqual({ data: "2026-11-12", saldo: 1500 });
  });
});
