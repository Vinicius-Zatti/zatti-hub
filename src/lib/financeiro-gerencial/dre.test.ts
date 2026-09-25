import { describe, expect, it } from "vitest";
import { calcularDre } from "./dre";
import type { CategoriaFinanceira, EstoqueMensal, Lancamento } from "./tipos";

function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return {
    parentId: null,
    nivel: "conta",
    papelDre: null,
    nome: over.id,
    codigoSistema: null,
    padrao: true,
    ordem: 1,
    arquivado: false,
    ...over,
  };
}

const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "receita_salao", papelDre: "receita", nome: "Vendas no salão", ordem: 1 }),
  categoria({ id: "sub_deducoes", nivel: "subgrupo", codigoSistema: "deducoes_da_receita", nome: "Deduções da Receita", ordem: 1 }),
  categoria({ id: "deducao_impostos", parentId: "sub_deducoes", papelDre: "deducao_receita", nome: "Impostos sobre vendas", ordem: 1 }),
  categoria({ id: "sub_cvv", nivel: "subgrupo", codigoSistema: "custos_venda_variaveis", nome: "Custos de Venda Variáveis", ordem: 2 }),
  categoria({ id: "cvv_adquirencia", parentId: "sub_cvv", papelDre: "custo_venda_variavel", nome: "Taxas de adquirência", ordem: 1 }),
  categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Compras de mercadorias", ordem: 1 }),
  categoria({ id: "cmc_embalagens", papelDre: "cmc_embalagens", nome: "Compras de embalagens", ordem: 2 }),
  categoria({ id: "cmo_folha", papelDre: "cmo", nome: "Folha salarial contábil", ordem: 1 }),
  categoria({ id: "cmo_ferias", papelDre: "cmo_ferias", nome: "Férias", ordem: 2 }),
  categoria({ id: "sub_ocupacao", nivel: "subgrupo", codigoSistema: "custos_ocupacao", nome: "Custos de Ocupação", ordem: 1 }),
  categoria({ id: "co_aluguel", parentId: "sub_ocupacao", papelDre: "custo_ocupacao", nome: "Aluguel", ordem: 1 }),
  categoria({ id: "sno_retiradas", papelDre: "saida_nao_operacional", nome: "Retiradas de sócios", ordem: 1 }),
];

function lancamento(over: Partial<Lancamento> & { categoriaId: string; dataCompetencia: string; valor: number }): Lancamento {
  return {
    id: `lanc_${Math.random()}`,
    tipo: "despesa",
    categoriaNome: "",
    descricao: "teste",
    contaFinanceiraId: null,
    observacao: "",
    origem: "comum",
    recorrenciaId: null,
    criadoPorNome: "Teste",
    criadoEm: "2026-08-01T00:00:00Z",
    ...over,
    parcelas: [
      { id: "p1", lancamentoId: "l1", numero: 1, totalParcelas: 1, valor: over.valor, dataPrevista: over.dataCompetencia, contaFinanceiraId: null, status: "aberto", valorBaixado: 0 },
    ],
  };
}

const ESTOQUE_AGOSTO: EstoqueMensal = {
  id: "e1",
  competencia: "2026-08-01",
  receitaVendasProdutos: 0,
  estoqueInicialMercadorias: 1000,
  estoqueInicialEmbalagens: 200,
  estoqueFinalMercadorias: 800,
  estoqueFinalEmbalagens: 150,
  criadoPorNome: "Gestão",
  atualizadoEm: "2026-08-25T00:00:00Z",
};

describe("calcularDre", () => {
  it("agrupa lançamentos pela competência, ignorando lançamentos de outros meses", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-08-10", valor: 1000 }),
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-07-31", valor: 9999 }),
    ];
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: null });
    expect(dre.receitas.total).toBe(1000);
  });

  it("calcula o CMV pela fórmula completa, separado entre Mercadorias e Embalagens", () => {
    const lancamentos = [
      lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-08-05", valor: 500 }),
      lancamento({ categoriaId: "cmc_embalagens", dataCompetencia: "2026-08-06", valor: 100 }),
    ];
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    expect(dre.cmv).not.toBeNull();
    expect(dre.cmv.comprasMercadorias).toBe(500);
    expect(dre.cmv.comprasEmbalagens).toBe(100);
    expect(dre.cmv.cmc).toBe(600);
    // 1000 + 200 + 500 + 100 - 800 - 150 = 850
    expect(dre.cmv.total).toBe(850);
  });

  it("nunca usa só o CMC pra Margem de Contribuição/Resultado - CMV muda o resultado mesmo com CMC fixo", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-08-01", valor: 5000 }),
      lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-08-01", valor: 500 }),
    ];
    const estoqueA: EstoqueMensal = { ...ESTOQUE_AGOSTO, estoqueInicialMercadorias: 0, estoqueFinalMercadorias: 0, estoqueInicialEmbalagens: 0, estoqueFinalEmbalagens: 0 };
    const estoqueB: EstoqueMensal = { ...estoqueA, estoqueInicialMercadorias: 1000 };

    const dreA = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: estoqueA });
    const dreB = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: estoqueB });

    expect(dreA.cmv.cmc).toBe(dreB.cmv.cmc);
    expect(dreA.margemContribuicao).not.toBe(dreB.margemContribuicao);
    expect(dreA.margemContribuicao).toBe(4500);
    expect(dreB.margemContribuicao).toBe(3500);
  });

  it("CMV provisório: sem estoque final do mês, CMV = estoque inicial + CMC; sem estoque nenhum, só o CMC", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-08-01", valor: 1000 }),
      lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-08-01", valor: 300 }),
    ];
    const semNada = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: null });
    expect(semNada.cmv.provisorio).toBe(true);
    expect(semNada.cmv.total).toBe(300);
    expect(semNada.resultadoOperacional).toBe(700);

    // Só o estoque inicial informado no mês (final ainda em branco = 0).
    const soInicial = { ...ESTOQUE_AGOSTO, estoqueFinalMercadorias: 0, estoqueFinalEmbalagens: 0 };
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: soInicial });
    expect(dre.cmv.provisorio).toBe(true);
    expect(dre.cmv.total).toBe(1500); // 1000 + 200 + 300
  });

  it("estoque final vem do estoque inicial informado no mês seguinte (regra da planilha) e fecha o CMV", () => {
    const lancamentos = [lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-09-01", valor: 300 })];
    const setembro = { ...ESTOQUE_AGOSTO, competencia: "2026-09-01", estoqueFinalMercadorias: 0, estoqueFinalEmbalagens: 0 };
    const outubro = { ...ESTOQUE_AGOSTO, competencia: "2026-10-01", estoqueInicialMercadorias: 700, estoqueInicialEmbalagens: 100 };
    const dre = calcularDre({ competencia: "2026-09", lancamentos, categorias: CATEGORIAS, estoqueMensal: setembro, estoqueMesSeguinte: outubro });
    expect(dre.cmv.provisorio).toBe(false);
    expect(dre.cmv.estoqueFinalMercadorias).toBe(700);
    expect(dre.cmv.total).toBe(700); // 1000 + 200 + 300 - 700 - 100
  });

  it("setembro sem estoque final e sem estoque inicial de outubro fica provisório", () => {
    const lancamentos = [lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-09-01", valor: 300 })];
    const setembro = { ...ESTOQUE_AGOSTO, competencia: "2026-09-01", estoqueFinalMercadorias: 0, estoqueFinalEmbalagens: 0 };
    const outubroVazio = { ...ESTOQUE_AGOSTO, competencia: "2026-10-01", estoqueInicialMercadorias: 0, estoqueInicialEmbalagens: 0 };
    const dre = calcularDre({ competencia: "2026-09", lancamentos, categorias: CATEGORIAS, estoqueMensal: setembro, estoqueMesSeguinte: outubroVazio });
    expect(dre.cmv.provisorio).toBe(true);
    expect(dre.cmv.total).toBe(1500); // 1000 + 200 + 300
    expect(calcularDre({ competencia: "2026-09", lancamentos, categorias: CATEGORIAS, estoqueMensal: setembro }).cmv.provisorio).toBe(true);
  });

  it("CMV fecha com o estoque final de mercadorias informado; embalagens zero é valor real", () => {
    const lancamentos = [lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-08-01", valor: 300 })];
    const semEmbalagens = { ...ESTOQUE_AGOSTO, estoqueInicialEmbalagens: 0, estoqueFinalEmbalagens: 0 };
    const semEmb = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: semEmbalagens }).cmv;
    expect(semEmb.provisorio).toBe(false);
    expect(semEmb.total).toBe(500); // 1000 + 300 - 800
    const soEmbalagens = { ...ESTOQUE_AGOSTO, estoqueFinalMercadorias: 0 };
    expect(calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: soEmbalagens }).cmv.provisorio).toBe(true);
    const fechado = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    expect(fechado.cmv.provisorio).toBe(false);
    expect(fechado.cmv.total).toBe(550); // 1000 + 200 + 300 - 800 - 150
  });

  it("Saídas Não Operacionais não alteram o Resultado Operacional", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-08-01", valor: 10000 }),
      lancamento({ categoriaId: "sno_retiradas", dataCompetencia: "2026-08-01", valor: 3000 }),
    ];
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const resultadoSemSaidas = dre.resultadoOperacional;
    expect(dre.saidasNaoOperacionais.total).toBe(3000);
    expect(dre.resultadoOperacional).toBe(resultadoSemSaidas);
    expect(dre.geracaoCaixaAposSaidas).toBe(resultadoSemSaidas! - 3000);
  });

  it("agrupa CMO incluindo as contas de provisão (valor 0 quando não há lançamento, motor automático fica pra outra fase)", () => {
    const lancamentos = [lancamento({ categoriaId: "cmo_folha", dataCompetencia: "2026-08-01", valor: 1200 })];
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const ferias = dre.cmo.provisionamento.contas.concat(dre.cmo.contas).find((c) => c.id === "cmo_ferias");
    expect(ferias?.valor).toBe(0);
    expect(dre.cmo.total).toBe(1200);
  });
});
