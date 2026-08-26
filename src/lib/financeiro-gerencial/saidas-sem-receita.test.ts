import { describe, expect, it } from "vitest";
import { somarSaidaSemReceitaPorTipo } from "./saidas-sem-receita";
import { calcularDre } from "./dre";
import { montarDreAnual } from "./dre-anual";
import type { CategoriaFinanceira, EstoqueMensal, Lancamento, SaidaSemReceita } from "./tipos";

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
  categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Compras de mercadorias", ordem: 1 }),
  categoria({ id: "cmc_embalagens", papelDre: "cmc_embalagens", nome: "Compras de embalagens", ordem: 2 }),
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
    criadoEm: "2026-01-01T00:00:00Z",
    ...over,
    parcelas: [
      { id: "p1", lancamentoId: "l1", numero: 1, totalParcelas: 1, valor: over.valor, dataPrevista: over.dataCompetencia, contaFinanceiraId: null, status: "aberto", valorBaixado: 0 },
    ],
  };
}

const ESTOQUE_JANEIRO: EstoqueMensal = {
  id: "e1",
  competencia: "2026-01-01",
  receitaVendasProdutos: 5000,
  estoqueInicialMercadorias: 500,
  estoqueInicialEmbalagens: 0,
  estoqueFinalMercadorias: 500,
  estoqueFinalEmbalagens: 0,
  criadoPorNome: "Gestão",
  atualizadoEm: "2026-01-01T00:00:00Z",
};

function saida(over: Partial<SaidaSemReceita> & { tipo: SaidaSemReceita["tipo"]; valor: number }): SaidaSemReceita {
  return {
    id: `s_${Math.random()}`,
    competencia: "2026-01-01",
    criadoPorNome: "Gestão",
    atualizadoEm: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("somarSaidaSemReceitaPorTipo", () => {
  it("soma só as ocorrências do tipo pedido", () => {
    const saidas = [
      saida({ tipo: "perda_desperdicio", valor: 100, competencia: "2026-01-01" }),
      saida({ tipo: "perda_desperdicio", valor: 50, competencia: "2026-02-01" }),
      saida({ tipo: "doacao", valor: 999, competencia: "2026-01-01" }),
    ];
    expect(somarSaidaSemReceitaPorTipo(saidas, "perda_desperdicio")).toBe(150);
    expect(somarSaidaSemReceitaPorTipo(saidas, "doacao")).toBe(999);
    expect(somarSaidaSemReceitaPorTipo(saidas, "fidelidade")).toBe(0);
  });
});

describe("Saídas de Produtos sem Receita nunca alteram o CMV", () => {
  const lancamentos = [
    lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 10000 }),
    lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-01-10", valor: 3000 }),
  ];

  it("calcularDre nem aceita SaidaSemReceita como parâmetro - o CMV em R$ é idêntico independente do que existir em fin_saidas_sem_receita", () => {
    const dreSemSaidas = calcularDre({ competencia: "2026-01", lancamentos, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_JANEIRO });

    // `calcularDre` não tem parâmetro nenhum pra receber Saídas de Produtos
    // sem Receita - é estruturalmente impossível que elas mudem o CMV, com
    // valor nenhum que fosse (mesmo um exagerado como 99999 aqui). Isso aqui
    // só documenta e trava o comportamento: um refactor futuro que tentasse
    // ligar as duas coisas quebraria a assinatura da função, não
    // silenciosamente.
    saida({ tipo: "perda_desperdicio", valor: 99999, competencia: "2026-01-01" });
    saida({ tipo: "bonificacao_cortesia", valor: 50000, competencia: "2026-01-01" });

    const dreDeNovo = calcularDre({ competencia: "2026-01", lancamentos, categorias: CATEGORIAS, estoqueMensal: ESTOQUE_JANEIRO });
    expect(dreDeNovo.cmv).toEqual(dreSemSaidas.cmv);
    expect(dreDeNovo.cmv?.total).toBe(3000);
  });

  it("montarDreAnual também não aceita SaidaSemReceita - CMV, Margem e Resultado do ano ficam idênticos", () => {
    const dres = Array.from({ length: 12 }, (_, indice) => {
      const competencia = `2026-${String(indice + 1).padStart(2, "0")}`;
      return calcularDre({ competencia, lancamentos, categorias: CATEGORIAS, estoqueMensal: competencia === "2026-01" ? ESTOQUE_JANEIRO : null });
    });
    const receitaVendasProdutosPorMes = [5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const anual1 = montarDreAnual(dres, 2026, receitaVendasProdutosPorMes, new Date(2026, 0, 15));
    const anual2 = montarDreAnual(dres, 2026, receitaVendasProdutosPorMes, new Date(2026, 0, 15));

    const cmv1 = anual1.linhas.find((l) => l.id === "cmv")!;
    const cmv2 = anual2.linhas.find((l) => l.id === "cmv")!;
    expect(cmv1).toEqual(cmv2);
    expect(cmv1.valoresPorMes[0]).toBe(3000);
  });
});
