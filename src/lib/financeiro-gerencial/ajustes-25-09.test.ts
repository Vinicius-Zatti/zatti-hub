import { describe, expect, it } from "vitest";
import { gerarCompetenciasRecorrencia, gerarOcorrenciasRecorrencia } from "./recorrencia";
import { listarContasComCaminho, rotuloContaComGrupo } from "./categorias";
import { calcularDre, lancamentosDaVisao } from "./dre";
import type { BaixaBase, CategoriaFinanceira, LancamentoBase } from "./tipos";

function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return { parentId: null, nivel: "conta", papelDre: null, nome: over.id, codigoSistema: null, padrao: true, ordem: 1, arquivado: false, ...over };
}

const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "g_cmv", nivel: "grupo_principal", nome: "CMV - Custo da Mercadoria Vendida" }),
  categoria({ id: "sub_cmc", parentId: "g_cmv", nivel: "subgrupo", nome: "CMC - Custo da Mercadoria Comprada" }),
  categoria({ id: "cmc_merc", parentId: "sub_cmc", papelDre: "cmc_mercadorias", nome: "Custo com mercadorias" }),
  categoria({ id: "g_cmo", nivel: "grupo_principal", nome: "CMO - Custo de Mão de Obra" }),
  categoria({ id: "cmo_folha", parentId: "g_cmo", papelDre: "cmo", nome: "Folha salarial contábil", codigoSistema: "cmo_folha_salarial" }),
  categoria({ id: "cmo_ferias", parentId: "g_cmo", papelDre: "cmo_ferias", nome: "Férias" }),
  categoria({ id: "g_co", nivel: "grupo_principal", nome: "Custos Operacionais" }),
  categoria({ id: "sub_ocup", parentId: "g_co", nivel: "subgrupo", nome: "Custos de Ocupação" }),
  categoria({ id: "co_aluguel", parentId: "sub_ocup", papelDre: "custo_ocupacao", nome: "Aluguel" }),
];

describe("recorrência - competência segue a competência informada (25/09)", () => {
  it("competência avança mês a mês a partir da informada, independente do vencimento", () => {
    const vencimentos = gerarOcorrenciasRecorrencia({ diaVencimento: 5, dataInicio: "2026-10-05", fim: { modo: "quantidade", quantidadeOcorrencias: 3 } });
    expect(vencimentos).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    expect(gerarCompetenciasRecorrencia(vencimentos, "2026-09-30")).toEqual(["2026-09-30", "2026-10-30", "2026-11-30"]);
  });

  it("sem competência informada mantém a regra antiga (competência = vencimento)", () => {
    expect(gerarCompetenciasRecorrencia(["2026-10-05"])).toEqual(["2026-10-05"]);
  });
});

describe("rótulo curto do Plano de Contas no seletor (25/09)", () => {
  it("nome da conta + sigla do grupo principal, ou o nome do grupo quando não há sigla", () => {
    expect(rotuloContaComGrupo("cmc_merc", CATEGORIAS)).toBe("Custo com mercadorias - CMV");
    expect(rotuloContaComGrupo("cmo_folha", CATEGORIAS)).toBe("Folha salarial contábil - CMO");
    expect(rotuloContaComGrupo("co_aluguel", CATEGORIAS)).toBe("Aluguel - Custos Operacionais");
  });

  it("conta de provisão mantém o aviso de liquidação no rótulo", () => {
    const opcoes = listarContasComCaminho(CATEGORIAS, { incluirProvisao: true });
    expect(opcoes.find((o) => o.id === "cmo_ferias")?.rotulo).toBe("Férias - CMO (liquidação de provisão)");
  });
});

describe("DRE Projetada x Realizada (25/09)", () => {
  const lancamentos: LancamentoBase[] = [
    {
      id: "l1",
      tipo: "despesa",
      categoriaId: "cmo_folha",
      descricao: "Folha",
      dataCompetencia: "2026-09-05",
      origem: "comum",
      recorrenciaId: null,
      parcelas: [{ id: "p1", valor: 3000, dataPrevista: "2026-10-05", contaFinanceiraId: null, status: "parcial", numero: 1, totalParcelas: 1 }],
    },
    {
      id: "l2",
      tipo: "despesa",
      categoriaId: "co_aluguel",
      descricao: "Aluguel",
      dataCompetencia: "2026-09-01",
      origem: "comum",
      recorrenciaId: null,
      parcelas: [{ id: "p2", valor: 1000, dataPrevista: "2026-09-10", contaFinanceiraId: null, status: "aberto", numero: 1, totalParcelas: 1 }],
    },
  ];
  const baixas: BaixaBase[] = [
    { id: "b1", parcelaId: "p1", tipo: "baixa", contaFinanceiraId: "c1", valor: 2500, data: "2026-10-05" },
    { id: "b2", parcelaId: "p1", tipo: "estorno", contaFinanceiraId: "c1", valor: 500, data: "2026-10-06" },
  ];

  it("Projetada usa o valor cheio; Realizada usa só o baixado (estorno desconta), sempre na competência", () => {
    const projetada = calcularDre({ competencia: "2026-09", lancamentos: lancamentosDaVisao("projetado", lancamentos, baixas), categorias: CATEGORIAS, estoqueMensal: null });
    const realizada = calcularDre({ competencia: "2026-09", lancamentos: lancamentosDaVisao("realizado", lancamentos, baixas), categorias: CATEGORIAS, estoqueMensal: null });
    expect(projetada.cmo.subgrupos.flatMap((s) => s.contas).find((c) => c.id === "cmo_folha")?.valor).toBe(3000);
    expect(realizada.cmo.subgrupos.flatMap((s) => s.contas).find((c) => c.id === "cmo_folha")?.valor).toBe(2000);
    expect(realizada.custosOperacionais.total).toBe(0);
  });

  it("despesa de folha paga aparece no CMO da competência mesmo sem estoque do mês cadastrado", () => {
    const dre = calcularDre({ competencia: "2026-09", lancamentos: lancamentosDaVisao("realizado", lancamentos, baixas), categorias: CATEGORIAS, estoqueMensal: null });
    expect(dre.cmo.total).toBe(2000);
    expect(dre.resultadoOperacional).toBe(-2000); // sem inventário a DRE calcula mesmo assim (regra de 25/09)
  });
});
