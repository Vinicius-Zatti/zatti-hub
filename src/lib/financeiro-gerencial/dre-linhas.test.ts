import { describe, expect, it } from "vitest";
import { montarArvoreMensal } from "./dre-linhas";
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
  categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Compras de mercadorias", ordem: 1 }),
  categoria({ id: "cmc_embalagens", papelDre: "cmc_embalagens", nome: "Compras de embalagens", ordem: 2 }),
  categoria({ id: "cmo_folha", papelDre: "cmo", nome: "Folha salarial contábil", ordem: 1 }),
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

const LANCAMENTOS: Lancamento[] = [
  lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-08-10", valor: 10000 }),
  lancamento({ categoriaId: "deducao_impostos", dataCompetencia: "2026-08-10", valor: 500 }),
  lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-08-10", valor: 2000 }),
  lancamento({ categoriaId: "cmo_folha", dataCompetencia: "2026-08-10", valor: 1500 }),
  lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-08-10", valor: 800 }),
  lancamento({ categoriaId: "sno_retiradas", dataCompetencia: "2026-08-10", valor: 300 }),
];

function acharLinha(linhas: ReturnType<typeof montarArvoreMensal>, id: string) {
  return linhas.find((l) => l.id === id);
}

describe("montarArvoreMensal", () => {
  it("inclui Receita Operacional Líquida (Receita Bruta - Deduções) sem alterar o motor de cálculo", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    const liquida = acharLinha(linhas, "receita_liquida");
    expect(liquida?.valor).toBe(9500); // 10000 - 500
  });

  it("mostra as contas-filhas dos grupos principais como filhos (hierarquia pra expandir)", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    const receita = acharLinha(linhas, "receita_bruta");
    expect(receita?.filhos?.map((f) => f.rotulo)).toContain("Vendas no salão");

    const custosOperacionais = acharLinha(linhas, "custos_operacionais");
    const ocupacao = custosOperacionais?.filhos?.find((f) => f.rotulo === "Custos de Ocupação");
    expect(ocupacao?.filhos?.map((f) => f.rotulo)).toContain("Aluguel");
  });

  it("CMC fica dentro do CMV (nunca grupo principal) com uma linha por conta do CMC como netos", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    const cmv = acharLinha(linhas, "cmv");
    const cmc = cmv?.filhos?.find((f) => f.id === "cmv_cmc");
    expect(cmc?.valor).toBe(2000);
    expect(cmc?.rotulo).toBe("CMC - Custo da Mercadoria Comprada");
    expect(cmc?.filhos?.map((f) => f.rotulo)).toEqual(["Compras de mercadorias", "Compras de embalagens"]);
    expect(cmc?.filhos?.map((f) => f.valor)).toEqual([2000, 0]);
    expect(linhas.some((l) => l.rotulo.startsWith("CMC"))).toBe(false);
    expect(acharLinha(linhas, "cmv")?.rotulo).toBe("(-) CMV - Custo da Mercadoria Vendida");
    expect(acharLinha(linhas, "cmo")?.rotulo).toBe("(-) CMO - Custo de Mão de Obra");
  });

  it("CMC com várias contas de mercadoria (bebidas, mercadorias, proteínas) mostra cada uma e soma todas no CMC", () => {
    const categorias = [
      ...CATEGORIAS.filter((c) => c.papelDre !== "cmc_mercadorias" && c.papelDre !== "cmc_embalagens"),
      categoria({ id: "cmc_bebidas", papelDre: "cmc_mercadorias", nome: "Custo com bebidas", ordem: 1 }),
      categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Custo com mercadorias", ordem: 2 }),
      categoria({ id: "cmc_proteinas", papelDre: "cmc_mercadorias", nome: "Custo com proteínas", ordem: 3 }),
      categoria({ id: "cmc_embalagens", papelDre: "cmc_embalagens", nome: "Compras de embalagens", ordem: 4 }),
    ];
    const lancamentos = [
      ...LANCAMENTOS,
      lancamento({ categoriaId: "cmc_bebidas", dataCompetencia: "2026-08-10", valor: 300 }),
      lancamento({ categoriaId: "cmc_proteinas", dataCompetencia: "2026-08-10", valor: 700 }),
    ];
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias, estoqueMensal: ESTOQUE_AGOSTO });
    const cmc = acharLinha(montarArvoreMensal(dre), "cmv")?.filhos?.find((f) => f.id === "cmv_cmc");
    expect(cmc?.filhos?.map((f) => f.rotulo)).toEqual(["Custo com bebidas", "Custo com mercadorias", "Custo com proteínas", "Compras de embalagens"]);
    expect(cmc?.filhos?.map((f) => f.valor)).toEqual([300, 2000, 700, 0]);
    expect(cmc?.valor).toBe(3000);
    expect(dre.cmv?.comprasMercadorias).toBe(3000);
  });

  it("Receita Operacional Bruta mostra os subgrupos (Loja, Delivery, Outras) com contas e a conta direta do grupo depois", () => {
    const categorias = [
      ...CATEGORIAS.filter((c) => c.papelDre !== "receita"),
      categoria({ id: "g_receita", nivel: "grupo_principal", codigoSistema: "receita", nome: "Receita Operacional Bruta", ordem: 1 }),
      categoria({ id: "sub_loja", parentId: "g_receita", nivel: "subgrupo", codigoSistema: "receitas_loja", nome: "Receitas da Loja", ordem: 1 }),
      categoria({ id: "sub_delivery", parentId: "g_receita", nivel: "subgrupo", codigoSistema: "receitas_delivery", nome: "Receitas de Delivery", ordem: 2 }),
      categoria({ id: "loja_pix", parentId: "sub_loja", papelDre: "receita", nome: "Venda Pix", ordem: 4 }),
      categoria({ id: "loja_credito", parentId: "sub_loja", papelDre: "receita", nome: "Venda cartão de crédito", ordem: 1 }),
      categoria({ id: "ifood_venda", parentId: "sub_delivery", papelDre: "receita", nome: "Venda iFood", ordem: 1 }),
      categoria({ id: "receita_outras", parentId: "g_receita", papelDre: "receita", nome: "Outras receitas", ordem: 4 }),
    ];
    const lancamentos = [
      lancamento({ categoriaId: "loja_pix", tipo: "receita", dataCompetencia: "2026-08-10", valor: 1000 }),
      lancamento({ categoriaId: "loja_credito", tipo: "receita", dataCompetencia: "2026-08-10", valor: 2000 }),
      lancamento({ categoriaId: "ifood_venda", tipo: "receita", dataCompetencia: "2026-08-10", valor: 500 }),
      lancamento({ categoriaId: "receita_outras", tipo: "receita", dataCompetencia: "2026-08-10", valor: 100 }),
    ];
    const dre = calcularDre({ competencia: "2026-08", lancamentos, categorias, estoqueMensal: ESTOQUE_AGOSTO });
    const receita = acharLinha(montarArvoreMensal(dre), "receita_bruta");
    expect(receita?.valor).toBe(3600);
    expect(receita?.filhos?.map((f) => [f.rotulo, f.valor, f.nivel])).toEqual([
      ["Receitas da Loja", 3000, 1],
      ["Receitas de Delivery", 500, 1],
      ["Outras receitas", 100, 1],
    ]);
    expect(receita?.filhos?.[0].filhos?.map((f) => [f.rotulo, f.nivel])).toEqual([
      ["Venda cartão de crédito", 2],
      ["Venda Pix", 2],
    ]);
  });

  it("sem inventário do mês as linhas de estoque mostram '-' mas CMV, CMC, Margem e Resultados têm valor (regra de 25/09)", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: null });
    const linhas = montarArvoreMensal(dre);
    const cmv = acharLinha(linhas, "cmv");
    expect(cmv?.valor).toBe(2000); // CMV = compras
    expect(cmv?.filhos).toHaveLength(5);
    expect(cmv?.filhos?.filter((f) => f.id.startsWith("cmv_estoque")).every((f) => f.valor === null)).toBe(true);
    expect(cmv?.filhos?.find((f) => f.id === "cmv_cmc")?.valor).toBe(2000);
    expect(acharLinha(linhas, "margem")?.valor).toBe(7500); // 10000 - 500 - 2000
    expect(acharLinha(linhas, "resultado_operacional")?.valor).toBe(5200); // 7500 - 1500 - 800
  });

  it("CMO vem em dois subgrupos: Pagamentos e Provisões (provisões com nome próprio, somando no CMO)", () => {
    const categorias = [
      ...CATEGORIAS,
      categoria({ id: "cmo_ferias", papelDre: "cmo_ferias", nome: "Férias", ordem: 3 }),
      categoria({ id: "cmo_13", papelDre: "cmo_decimo_terceiro", nome: "13º salário", ordem: 17 }),
      categoria({ id: "cmo_multa", papelDre: "cmo_multa_fgts", nome: "Provisão de multa do FGTS", ordem: 18 }),
    ];
    const valoresProvisao = new Map([["cmo_ferias", 100], ["cmo_13", 80], ["cmo_multa", 20]]);
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias, estoqueMensal: ESTOQUE_AGOSTO, valoresProvisao });
    const cmo = acharLinha(montarArvoreMensal(dre), "cmo");
    expect(cmo?.valor).toBe(1700); // 1500 de folha + 200 de provisões
    expect(cmo?.filhos?.map((f) => [f.rotulo, f.valor])).toEqual([
      ["Pagamentos", 1500],
      ["Provisões", 200],
    ]);
    expect(cmo?.filhos?.[1].filhos?.map((f) => f.rotulo)).toEqual(["Provisão de férias", "Provisão de 13º", "Provisão de multa do FGTS"]);
  });

  it("linha de resultado (Margem, Resultado Operacional, Resultado Econômico, Resultado Líquido) não tem filhos - não é expansível", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    expect(acharLinha(linhas, "margem")?.filhos).toBeUndefined();
    expect(acharLinha(linhas, "resultado_operacional")?.filhos).toBeUndefined();
    expect(acharLinha(linhas, "receita_liquida")?.filhos).toBeUndefined();
    expect(acharLinha(linhas, "resultado_economico")?.filhos).toBeUndefined();
    expect(acharLinha(linhas, "resultado_liquido")?.filhos).toBeUndefined();
  });

  it("Saídas Não Operacionais e Resultado Econômico ficam na mesma tabela, logo após Resultado Líquido", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    const ids = linhas.map((l) => l.id);
    const indiceResultadoLiquido = ids.indexOf("resultado_liquido");
    expect(ids.slice(indiceResultadoLiquido)).toEqual(["resultado_liquido", "saidas", "resultado_economico"]);
    expect(acharLinha(linhas, "saidas")?.filhos?.map((f) => f.rotulo)).toContain("Retiradas de sócios");
  });

  it("Resultado Líquido fecha a própria DRE (mesmo valor de Resultado Operacional) e nunca é reduzido por Saídas Não Operacionais", () => {
    const comSaidas = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const semSaidas = calcularDre({
      competencia: "2026-08",
      lancamentos: LANCAMENTOS.filter((l) => l.categoriaId !== "sno_retiradas"),
      categorias: CATEGORIAS,
      estoqueMensal: ESTOQUE_AGOSTO,
    });

    const linhasComSaidas = montarArvoreMensal(comSaidas);
    const linhasSemSaidas = montarArvoreMensal(semSaidas);

    const resultadoLiquidoComSaidas = acharLinha(linhasComSaidas, "resultado_liquido");
    const resultadoLiquidoSemSaidas = acharLinha(linhasSemSaidas, "resultado_liquido");
    const resultadoOperacional = acharLinha(linhasComSaidas, "resultado_operacional");
    const resultadoEconomico = acharLinha(linhasComSaidas, "resultado_economico");

    // Resultado Líquido é igual com ou sem Saídas Não Operacionais lançadas.
    expect(resultadoLiquidoComSaidas?.valor).toBe(resultadoLiquidoSemSaidas?.valor);
    expect(resultadoLiquidoComSaidas?.valor).toBe(resultadoOperacional?.valor);
    // Resultado Econômico = Resultado Líquido - Saídas Não Operacionais.
    expect(resultadoEconomico?.valor).toBe(resultadoOperacional!.valor! - 300);
    expect(resultadoEconomico?.rotulo).toBe("= Resultado Econômico");
  });
});
