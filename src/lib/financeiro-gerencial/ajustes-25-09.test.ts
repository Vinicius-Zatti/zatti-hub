import { describe, expect, it } from "vitest";
import { gerarCompetenciasRecorrencia, gerarOcorrenciasRecorrencia } from "./recorrencia";
import { listarContasComCaminho, rotuloContaComGrupo } from "./categorias";
import { calcularDre, lancamentosDaVisao, type VisaoDre } from "./dre";
import { montarDreAnual } from "./dre-anual";
import type { CategoriaFinanceira, LancamentoBase } from "./tipos";

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

describe("DRE Realizada, Projetada e Completa pela competência, nunca pelo pagamento (V1, 25/09)", () => {
  const HOJE = "2026-09-25";
  const lancamento = (id: string, categoriaId: string, dataCompetencia: string, status: "aberto" | "quitado" | "cancelado", valor: number): LancamentoBase => ({
    id,
    tipo: "despesa",
    categoriaId,
    descricao: id,
    dataCompetencia,
    origem: "recorrencia",
    recorrenciaId: "r",
    parcelas: [{ id: `p_${id}`, valor, dataPrevista: dataCompetencia, contaFinanceiraId: null, status, numero: 1, totalParcelas: 1 }],
  });
  const LANCAMENTOS: LancamentoBase[] = [
    lancamento("folha_set_aberta", "cmo_folha", "2026-09-05", "aberto", 3000), // aconteceu, não paga
    lancamento("folha_out_paga", "cmo_folha", "2026-10-05", "quitado", 3000), // paga adiantada, competência futura
    lancamento("aluguel_set_cancelado", "co_aluguel", "2026-09-01", "cancelado", 1000),
  ];
  const cmo = (visao: VisaoDre, competencia: string) =>
    calcularDre({ competencia, lancamentos: lancamentosDaVisao(visao, LANCAMENTOS, HOJE), categorias: CATEGORIAS, estoqueMensal: null }).cmo.total;

  it("Realizada = competência até hoje, paga ou não; pagamento adiantado de competência futura não entra", () => {
    expect(cmo("realizada", "2026-09")).toBe(3000);
    expect(cmo("realizada", "2026-10")).toBe(0);
  });

  it("Projetada = competência depois de hoje; Completa = as duas", () => {
    expect(cmo("projetada", "2026-09")).toBe(0);
    expect(cmo("projetada", "2026-10")).toBe(3000);
    expect(cmo("completa", "2026-09") + cmo("completa", "2026-10")).toBe(6000);
  });

  it("parcela cancelada não entra em nenhuma visão", () => {
    for (const visao of ["realizada", "projetada", "completa"] as VisaoDre[]) {
      const dre = calcularDre({ competencia: "2026-09", lancamentos: lancamentosDaVisao(visao, LANCAMENTOS, HOJE), categorias: CATEGORIAS, estoqueMensal: null });
      expect(dre.custosOperacionais.total).toBe(0);
    }
  });

  it("Projetada e Completa mostram os meses futuros (é onde está o previsto); Realizada continua mostrando '-' no futuro", () => {
    const anual = (visao: VisaoDre) => {
      const lancamentos = lancamentosDaVisao(visao, LANCAMENTOS, HOJE);
      const dres = Array.from({ length: 12 }, (_, i) =>
        calcularDre({ competencia: `2026-${String(i + 1).padStart(2, "0")}`, lancamentos, categorias: CATEGORIAS, estoqueMensal: null }),
      );
      return montarDreAnual(dres, 2026, Array(12).fill(0), new Date("2026-09-25T15:00:00Z"), { incluirMesesFuturos: visao !== "realizada" });
    };
    expect(anual("realizada").linhas.find((l) => l.id === "cmo")!.valoresPorMes[9]).toBeNull();
    expect(anual("projetada").linhas.find((l) => l.id === "cmo")!.valoresPorMes[9]).toBe(3000);
    expect(anual("completa").linhas.find((l) => l.id === "cmo")!.total).toBe(6000);
  });
});

describe("% CMC provisório exclui a receita de entregas (25/09)", () => {
  it("% CMC = CMC ÷ (Receita Operacional Bruta - contas de entrega por codigo_sistema)", () => {
    const categorias: CategoriaFinanceira[] = [
      ...CATEGORIAS,
      categoria({ id: "venda_ifood", papelDre: "receita", codigoSistema: "receita_ifood_venda", nome: "Venda iFood" }),
      categoria({ id: "entrega_ifood", papelDre: "receita", codigoSistema: "receita_ifood_entrega", nome: "Entrega iFood" }),
      categoria({ id: "compras", papelDre: "cmc_mercadorias", codigoSistema: "cmc_compras_mercadorias", nome: "Custo com mercadorias" }),
    ];
    const lanc = (id: string, categoriaId: string, tipo: "receita" | "despesa", valor: number): LancamentoBase => ({
      id,
      tipo,
      categoriaId,
      descricao: id,
      dataCompetencia: "2026-01-10",
      origem: "comum",
      recorrenciaId: null,
      parcelas: [{ id: `p_${id}`, valor, dataPrevista: "2026-01-10", contaFinanceiraId: null, status: "aberto", numero: 1, totalParcelas: 1 }],
    });
    const lancamentos = [lanc("v", "venda_ifood", "receita", 8000), lanc("e", "entrega_ifood", "receita", 2000), lanc("c", "compras", "despesa", 2000)];
    const dres = Array.from({ length: 12 }, (_, i) =>
      calcularDre({ competencia: `2026-${String(i + 1).padStart(2, "0")}`, lancamentos, categorias, estoqueMensal: null }),
    );
    const anual = montarDreAnual(dres, 2026, Array(12).fill(0), new Date(2026, 0, 25));
    const percentual = anual.linhas.find((l) => l.id === "cmv_percentual")!;
    expect(percentual.rotulo).toBe("% CMC (provisório)");
    expect(percentual.valoresPorMes[0]).toBeCloseTo(2000 / 8000, 10); // e não 2000 / 10000
  });
});
