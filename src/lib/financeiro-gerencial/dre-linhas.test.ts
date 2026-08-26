import { describe, expect, it } from "vitest";
import { montarLinhasExpandida, montarLinhasResumida } from "./dre-linhas";
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

describe("montarLinhasResumida", () => {
  it("oculta contas-filhas (Vendas no salão, Aluguel etc. não aparecem) e o CMC interno", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const { principal } = montarLinhasResumida(dre);
    const rotulos = principal.map((l) => l.rotulo);

    expect(rotulos).not.toContain("Vendas no salão");
    expect(rotulos).not.toContain("Aluguel");
    expect(rotulos.some((r) => r.includes("CMC"))).toBe(false);
    expect(rotulos).toContain("(-) CMV");
    expect(rotulos).toContain("= MARGEM DE CONTRIBUIÇÃO");
    expect(rotulos).toContain("= RESULTADO OPERACIONAL");
  });
});

describe("montarLinhasExpandida", () => {
  it("mostra todos os grupos, subgrupos e contas, incluindo CMC dentro do CMV", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const { principal } = montarLinhasExpandida(dre);
    const rotulos = principal.map((l) => l.rotulo);

    expect(rotulos).toContain("Vendas no salão");
    expect(rotulos).toContain("Aluguel");
    expect(rotulos).toContain("Compras de Mercadorias");
    expect(rotulos).toContain("CMC");
    expect(rotulos).toContain("Estoque inicial de Mercadorias");
    expect(rotulos).toContain("(-) Estoque final de Embalagens");
  });

  it("Saídas Não Operacionais ficam numa seção separada da DRE principal, e a soma de Saídas bate com o lançamento", () => {
    const dre = calcularDre({ competencia: "2026-08", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_AGOSTO });
    const { principal, indicador } = montarLinhasExpandida(dre);

    expect(principal.some((l) => l.rotulo.includes("Retiradas de sócios"))).toBe(false);
    expect(indicador.some((l) => l.rotulo === "Retiradas de sócios" && l.valor === 300)).toBe(true);
  });
});
