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

  it("CMC e CMV em duas linhas; CMV fechado = EI + CMC - EF, com o estoque dentro do CMV ao expandir", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    expect(linhas.map((l) => l.rotulo)).toEqual([
      "Receita Operacional Bruta",
      "Deduções",
      "Receita Operacional Líquida",
      "CMC - Custo da Mercadoria Comprada",
      "CMV - Custo da Mercadoria Vendida",
      "Resultado Operacional Bruto",
      "Custos Fixos",
      "Custo com Mão de Obra (CMO)",
      "Custos Operacionais",
      "Resultado Líquido do Exercício",
      "Saídas não Operacionais",
      "Resultado Econômico",
    ]);
    expect(acharLinha(linhas, "cmc")?.filhos?.map((f) => [f.rotulo, f.valor])).toEqual([
      ["Compras de mercadorias", 2000],
      ["Compras de embalagens", 0],
    ]);
    const cmv = acharLinha(linhas, "cmv");
    expect(cmv?.valor).toBe(2250); // 1000 + 200 + 2000 - 800 - 150
    expect(cmv?.filhos?.map((f) => f.valor)).toEqual([1000, 200, 2000, 800, 150]);
    expect(acharLinha(linhas, "margem")?.valor).toBe(7250); // 10000 - 500 - 2250: um CMV só para todos os resultados
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
    const cmc = acharLinha(montarArvoreMensal(dre), "cmc");
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

  it("CMV provisório sem estoque final: EI do mês anterior + CMC, estoque final '-' (regra final de 25/09)", () => {
    const julho = { ...ESTOQUE_AGOSTO, competencia: "2026-07-01", estoqueFinalMercadorias: 900, estoqueFinalEmbalagens: 120 };
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: null, estoqueMesAnterior: julho });
    const linhas = montarArvoreMensal(dre);
    const cmv = acharLinha(linhas, "cmv");
    expect(dre.cmv.provisorio).toBe(true);
    expect(cmv?.valor).toBe(3020); // 900 + 120 (finais de julho) + 2000 de CMC
    expect(cmv?.filhos?.slice(3).every((f) => f.valor === null)).toBe(true);
    expect(acharLinha(linhas, "margem")?.valor).toBe(6480); // 10000 - 500 - 3020
  });

  it("CMO como na planilha: contas de pagamento e o bloco Provisionamento (Provisão 13º, Férias, Multa FGTS) somando no CMO", () => {
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
      ["Folha salarial contábil", 1500],
      ["Provisionamento", 200],
    ]);
    expect(cmo?.filhos?.[1].filhos?.map((f) => f.rotulo)).toEqual(["Provisão 13º", "Provisão Férias", "Provisão Multa FGTS"]);
  });

  it("linha de resultado (Margem, Resultado Operacional, Resultado Econômico, Resultado Líquido) não tem filhos - não é expansível", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    expect(acharLinha(linhas, "margem")?.filhos).toBeUndefined();
    expect(acharLinha(linhas, "resultado_operacional")).toBeUndefined(); // duplicava o Resultado Líquido do Exercício
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
    const resultadoEconomico = acharLinha(linhasComSaidas, "resultado_economico");

    // Resultado Líquido é igual com ou sem Saídas Não Operacionais lançadas.
    expect(resultadoLiquidoComSaidas?.valor).toBe(resultadoLiquidoSemSaidas?.valor);
    // Resultado Econômico = Resultado Líquido - Saídas Não Operacionais.
    expect(resultadoEconomico?.valor).toBe(resultadoLiquidoComSaidas!.valor! - 300);
    expect(resultadoEconomico?.rotulo).toBe("Resultado Econômico");
  });
});
