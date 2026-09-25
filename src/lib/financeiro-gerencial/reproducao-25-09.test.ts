import { describe, expect, it } from "vitest";
import { aberturasDasContas, montarMovimentosCaixa } from "./caixa";
import { calcularDre, lancamentosDaVisao } from "./dre";
import { montarDreAnual } from "./dre-anual";
import { montarDfcAnual, montarFluxoMensal } from "./relatorios-caixa";
import type { BaixaBase, CategoriaFinanceira, ContaFinanceira, LancamentoBase } from "./tipos";

// Dados reais de produção (adega-alemao, 25/09/2026) relatados pelo Vinícius.
function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return { parentId: null, nivel: "conta", papelDre: null, nome: over.id, codigoSistema: null, padrao: true, ordem: 1, arquivado: false, ...over };
}
const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "g_receita", nivel: "grupo_principal", codigoSistema: "receita", nome: "Receita Operacional Bruta" }),
  categoria({ id: "sub_loja", parentId: "g_receita", nivel: "subgrupo", codigoSistema: "receitas_loja", nome: "Receitas da Loja" }),
  categoria({ id: "venda_credito", parentId: "sub_loja", papelDre: "receita", nome: "Venda cartão de crédito" }),
  categoria({ id: "g_cmo", nivel: "grupo_principal", codigoSistema: "cmo", nome: "CMO - Custo de Mão de Obra" }),
  categoria({ id: "folha", parentId: "g_cmo", papelDre: "cmo", codigoSistema: "cmo_folha_salarial", nome: "Folha salarial contábil" }),
];
const CAIXA_DA_LOJA: ContaFinanceira = { id: "b13fedf5", nome: "Caixa da loja", tipo: "banco", saldoInicial: 0, dataSaldoInicial: "2026-09-25", ativo: true };
const RECEITA: LancamentoBase = {
  id: "c15ced1a",
  tipo: "receita",
  categoriaId: "venda_credito",
  descricao: "Venda",
  dataCompetencia: "2026-09-25",
  origem: "comum",
  recorrenciaId: null,
  parcelas: [{ id: "p_receita", valor: 10000, dataPrevista: "2026-09-25", contaFinanceiraId: "b13fedf5", status: "quitado", numero: 1, totalParcelas: 1 }],
};
const BAIXA_RECEITA: BaixaBase = { id: "524333de", parcelaId: "p_receita", tipo: "baixa", contaFinanceiraId: "b13fedf5", valor: 10000, data: "2026-09-25" };
// Folha criada pela recorrência antiga (competência = vencimento 05/10), paga antecipada em 25/09.
const FOLHA: LancamentoBase = {
  id: "folha_out",
  tipo: "despesa",
  categoriaId: "folha",
  descricao: "Folha",
  dataCompetencia: "2026-10-05",
  origem: "recorrencia",
  recorrenciaId: "ecd44e0a",
  parcelas: [{ id: "p_folha", valor: 1580, dataPrevista: "2026-10-05", contaFinanceiraId: "b13fedf5", status: "quitado", numero: 1, totalParcelas: 1 }],
};
const BAIXA_FOLHA: BaixaBase = { id: "b_folha", parcelaId: "p_folha", tipo: "baixa", contaFinanceiraId: "b13fedf5", valor: 1580, data: "2026-09-25" };
const HOJE = new Date("2026-09-25T15:00:00Z");

function dreAnual(visao: "projetado" | "realizado") {
  const lancamentos = lancamentosDaVisao(visao, [RECEITA, FOLHA], [BAIXA_RECEITA, BAIXA_FOLHA]);
  const dres = Array.from({ length: 12 }, (_, i) =>
    calcularDre({ competencia: `2026-${String(i + 1).padStart(2, "0")}`, lancamentos, categorias: CATEGORIAS, estoqueMensal: null }),
  );
  return montarDreAnual(dres, 2026, Array(12).fill(0), HOJE);
}

describe("reprodução do teste real de 25/09 (adega-alemao)", () => {
  it("bug 1: receita recebida no dia do saldo inicial da conta aparece na DRE Realizada de setembro", () => {
    const receita = dreAnual("realizado").linhas.find((l) => l.id === "receita_bruta")!;
    expect(receita.valoresPorMes[8]).toBe(10000);
  });

  it("bug 1: a mesma baixa entra como entrada no Fluxo de Caixa realizado e no DFC (movimento no dia do saldo inicial conta)", () => {
    const movimentos = montarMovimentosCaixa({ visao: "realizado", lancamentos: [RECEITA, FOLHA], baixas: [BAIXA_RECEITA, BAIXA_FOLHA], contas: [CAIXA_DA_LOJA] });
    const fluxo = montarFluxoMensal({ ano: 2026, movimentos, categorias: CATEGORIAS, aberturas: aberturasDasContas([CAIXA_DA_LOJA]), divisorMedia: 9 });
    expect(fluxo.find((l) => l.id === "entradas")!.valoresPorMes[8]).toBe(10000);
    expect(fluxo.find((l) => l.id === "saldo_final")!.valoresPorMes[8]).toBe(8420);
    const dfc = montarDfcAnual({ ano: 2026, movimentos, categorias: CATEGORIAS, aberturas: aberturasDasContas([CAIXA_DA_LOJA]), divisorMedia: 9 });
    expect(dfc.find((l) => l.id === "saldo_final")!.valoresPorMes[8]).toBe(8420);
  });

  it("bug 3: sem inventário do mês, Margem e Resultados aparecem (CMV = compras)", () => {
    const linhas = dreAnual("realizado").linhas;
    for (const id of ["margem", "resultado_operacional", "resultado_liquido", "resultado_economico"]) {
      expect(linhas.find((l) => l.id === id)!.valoresPorMes[8]).toBe(10000);
    }
  });

  it("bug 2: folha paga antecipada fica na competência dela (outubro) - regime de competência, mesmo na Realizada", () => {
    const cmo = dreAnual("realizado").linhas.find((l) => l.id === "cmo")!;
    expect(cmo.valoresPorMes[8]).toBe(0);
    expect(cmo.valoresPorMes[9]).toBeNull(); // outubro ainda é mês futuro em 25/09
  });

  it("provisão nunca aparece como saída no Fluxo de Caixa nem no DFC: só a folha paga sai do caixa", () => {
    const movimentos = montarMovimentosCaixa({ visao: "projetado", lancamentos: [FOLHA], baixas: [], contas: [CAIXA_DA_LOJA] });
    const dfc = montarDfcAnual({ ano: 2026, movimentos, categorias: CATEGORIAS, aberturas: aberturasDasContas([CAIXA_DA_LOJA]), divisorMedia: 9 });
    const cmoCaixa = dfc.flatMap((l) => [l, ...(l.filhos ?? [])]).find((l) => l.id === "dfc_cmo");
    // Outubro: só os 1580 da folha; a provisão de férias/13º/multa (que a DRE
    // mostra por competência) não gera movimento de caixa nenhum.
    expect(cmoCaixa?.valoresPorMes[9]).toBe(1580);
    expect(movimentos).toHaveLength(1);
  });
});
