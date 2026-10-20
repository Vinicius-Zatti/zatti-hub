import { describe, expect, it } from "vitest";
import { montarDreAnualDaUnidade } from "./dre-unidade";
import type { CategoriaFinanceira, Lancamento } from "./tipos";

function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return { parentId: null, nivel: "conta", papelDre: null, nome: over.id, codigoSistema: null, padrao: true, ordem: 1, arquivado: false, ...over };
}

const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "receita_salao", papelDre: "receita", nome: "Vendas no salão", ordem: 1 }),
  categoria({ id: "sub_ocupacao", nivel: "subgrupo", codigoSistema: "custos_ocupacao", nome: "Custos de Ocupação", ordem: 1 }),
  categoria({ id: "co_aluguel", parentId: "sub_ocupacao", papelDre: "custo_ocupacao", nome: "Aluguel", ordem: 1 }),
  categoria({ id: "co_condominio", parentId: "sub_ocupacao", papelDre: "custo_ocupacao", nome: "Condomínio", ordem: 2, arquivado: true }),
  categoria({ id: "co_agua", parentId: "sub_ocupacao", papelDre: "custo_ocupacao", nome: "Água", ordem: 3 }),
];

function lancamento(over: { categoriaId: string; dataCompetencia: string; valor: number }): Lancamento {
  return {
    id: `lanc_${Math.random()}`,
    tipo: "despesa",
    categoriaId: over.categoriaId,
    categoriaNome: "",
    descricao: "teste",
    dataCompetencia: over.dataCompetencia,
    contaFinanceiraId: null,
    observacao: "",
    origem: "comum",
    recorrenciaId: null,
    criadoPorNome: "Teste",
    criadoEm: "2026-08-01T00:00:00Z",
    parcelas: [
      { id: "p1", lancamentoId: "l1", numero: 1, totalParcelas: 1, valor: over.valor, dataPrevista: over.dataCompetencia, contaFinanceiraId: null, status: "aberto", valorBaixado: 0 },
    ],
  } as Lancamento;
}

function montar(lancamentos: Lancamento[]) {
  return montarDreAnualDaUnidade({ ano: 2026, todosLancamentos: lancamentos, categorias: CATEGORIAS, estoques: [], parametros: [], reversoes: [], hoje: new Date("2026-10-20") });
}

// Conta removida do plano (arquivada) na DRE anual (20/10/2026, achado da revisão).
describe("DRE anual com conta removida do plano", () => {
  it("valor só em janeiro: não quebra e a linha aparece", () => {
    const lancs = [
      lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-01-05", valor: 100 }),
      lancamento({ categoriaId: "co_condominio", dataCompetencia: "2026-01-05", valor: 300 }),
      lancamento({ categoriaId: "co_agua", dataCompetencia: "2026-01-05", valor: 50 }),
      lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-02-05", valor: 100 }),
      lancamento({ categoriaId: "co_agua", dataCompetencia: "2026-02-05", valor: 50 }),
    ];
    let erro: unknown = null;
    try {
      montar(lancs);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeNull();
  });

  it("valor só em fevereiro: cada conta fica com o próprio valor", () => {
    const lancs = [
      lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-01-05", valor: 100 }),
      lancamento({ categoriaId: "co_agua", dataCompetencia: "2026-01-05", valor: 50 }),
      lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-02-05", valor: 100 }),
      lancamento({ categoriaId: "co_condominio", dataCompetencia: "2026-02-05", valor: 300 }),
      lancamento({ categoriaId: "co_agua", dataCompetencia: "2026-02-05", valor: 50 }),
    ];
    const { dreAnual } = montar(lancs);
    const custosOp = dreAnual.linhas.find((l) => l.id === "custos_operacionais");
    const ocup = custosOp?.filhos?.find((l) => l.id === "sub_ocupacao");
    const agua = ocup?.filhos?.find((f) => f.id === "co_agua");
    const condominio = ocup?.filhos?.find((f) => f.id === "co_condominio");
    expect(agua?.valoresPorMes[1]).toBe(50);
    expect(condominio?.valoresPorMes[1]).toBe(300);
  });

  it("sem valor no ano: a linha some", () => {
    const { dreAnual } = montar([lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-01-05", valor: 100 })]);
    const ocup = dreAnual.linhas.find((l) => l.id === "custos_operacionais")?.filhos?.find((l) => l.id === "sub_ocupacao");
    expect(ocup?.filhos?.some((f) => f.id === "co_condominio")).toBe(false);
    expect(ocup?.filhos?.some((f) => f.id === "co_agua")).toBe(true);
  });
});
