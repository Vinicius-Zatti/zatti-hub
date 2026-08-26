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

  it("CMC fica dentro do CMV (nunca grupo principal) com Compras de Mercadorias/Embalagens como netos", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    const cmv = acharLinha(linhas, "cmv");
    const cmc = cmv?.filhos?.find((f) => f.id === "cmv_cmc");
    expect(cmc?.valor).toBe(2000);
    expect(cmc?.filhos?.map((f) => f.rotulo)).toEqual(["Compras de Mercadorias", "Compras de Embalagens"]);
    expect(linhas.some((l) => l.rotulo === "CMC")).toBe(false);
  });

  it("quando o estoque mensal não foi cadastrado, todo o ramo do CMV vem null (nunca 0) mas mantém a mesma forma", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: null });
    const linhas = montarArvoreMensal(dre);
    const cmv = acharLinha(linhas, "cmv");
    expect(cmv?.valor).toBeNull();
    expect(cmv?.filhos).toHaveLength(5);
    expect(cmv?.filhos?.every((f) => f.valor === null)).toBe(true);
    expect(cmv?.filhos?.find((f) => f.id === "cmv_cmc")?.filhos).toHaveLength(2);

    const margem = acharLinha(linhas, "margem");
    expect(margem?.valor).toBeNull();
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

  it("Saídas Não Operacionais e Resultado Líquido ficam na mesma tabela, logo após Resultado Econômico", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const linhas = montarArvoreMensal(dre);
    const ids = linhas.map((l) => l.id);
    const indiceResultadoEconomico = ids.indexOf("resultado_economico");
    expect(ids.slice(indiceResultadoEconomico)).toEqual(["resultado_economico", "saidas", "resultado_liquido"]);
    expect(acharLinha(linhas, "saidas")?.filhos?.map((f) => f.rotulo)).toContain("Retiradas de sócios");
  });

  it("Resultado Econômico fecha a própria DRE (mesmo valor de Resultado Operacional) e nunca é reduzido por Saídas Não Operacionais", () => {
    const comSaidas = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const semSaidas = calcularDre({
      competencia: "2026-08",
      lancamentos: LANCAMENTOS.filter((l) => l.categoriaId !== "sno_retiradas"),
      categorias: CATEGORIAS,
      estoqueMensal: ESTOQUE_AGOSTO,
    });

    const linhasComSaidas = montarArvoreMensal(comSaidas);
    const linhasSemSaidas = montarArvoreMensal(semSaidas);

    const resultadoEconomicoComSaidas = acharLinha(linhasComSaidas, "resultado_economico");
    const resultadoEconomicoSemSaidas = acharLinha(linhasSemSaidas, "resultado_economico");
    const resultadoOperacional = acharLinha(linhasComSaidas, "resultado_operacional");
    const resultadoLiquido = acharLinha(linhasComSaidas, "resultado_liquido");

    // Resultado Econômico é igual com ou sem Saídas Não Operacionais lançadas.
    expect(resultadoEconomicoComSaidas?.valor).toBe(resultadoEconomicoSemSaidas?.valor);
    expect(resultadoEconomicoComSaidas?.valor).toBe(resultadoOperacional?.valor);
    // Resultado Líquido, por outro lado, é reduzido pelas Saídas Não Operacionais.
    expect(resultadoLiquido?.valor).toBe(resultadoOperacional!.valor! - 300);
    expect(resultadoLiquido?.valor).not.toBe(resultadoEconomicoComSaidas?.valor);
  });
});
