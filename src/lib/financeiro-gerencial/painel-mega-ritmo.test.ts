import { describe, expect, it } from "vitest";
import { calcularDre, lancamentosDaDre } from "./dre";
import { calcularFarolRitmo, fracaoDecorrida, limiteVermelho, metaCmvComprasDoMes, montarRitmoDoMes } from "./painel-mega-ritmo";
import type { CategoriaFinanceira, LancamentoBase } from "./tipos";

function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return { parentId: null, nivel: "conta", papelDre: null, nome: over.id, codigoSistema: null, padrao: true, ordem: 1, arquivado: false, ...over };
}

const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "receita_salao", papelDre: "receita", nome: "Vendas no salão" }),
  categoria({ id: "sub_cvv", nivel: "subgrupo", codigoSistema: "custos_venda_variaveis", nome: "Custos de Venda Variáveis" }),
  categoria({ id: "cvv_adquirencia", parentId: "sub_cvv", papelDre: "custo_venda_variavel", codigoSistema: "cvv_adquirencia", nome: "Taxas" }),
  categoria({ id: "cvv_entregas", parentId: "sub_cvv", papelDre: "custo_venda_variavel", codigoSistema: "cvv_entregas_fretes", nome: "Entregas" }),
  categoria({ id: "cmc_mercadorias", papelDre: "cmc_mercadorias", nome: "Compras de mercadorias" }),
  categoria({ id: "cmc_embalagens", papelDre: "cmc_embalagens", nome: "Compras de embalagens" }),
  categoria({ id: "cmo_folha", papelDre: "cmo", codigoSistema: "cmo_salarios", nome: "Folha" }),
  categoria({ id: "cmo_freela", papelDre: "cmo", codigoSistema: "cmo_freelancers", nome: "Freelancers" }),
  categoria({ id: "co_aluguel", papelDre: "custo_ocupacao", nome: "Aluguel" }),
];

let seq = 0;
function lanc(categoriaId: string, dataCompetencia: string, valor: number, over: { status?: "aberto" | "cancelado"; origem?: LancamentoBase["origem"] } = {}): LancamentoBase {
  const id = `l${++seq}`;
  return {
    id,
    tipo: "despesa",
    descricao: "teste",
    origem: over.origem ?? "comum",
    recorrenciaId: null,
    categoriaId,
    dataCompetencia,
    parcelas: [{ id: `${id}_p1`, valor, dataPrevista: dataCompetencia, contaFinanceiraId: "banco", status: over.status ?? "aberto", numero: 1, totalParcelas: 1 }],
  } as LancamentoBase;
}

// Setembro de 2026 (30 dias), olhado no dia 15: metade do mês.
const LANCAMENTOS: LancamentoBase[] = [
  lanc("cmc_mercadorias", "2026-09-01", 10000),
  lanc("cmc_embalagens", "2026-09-10", 5000),
  lanc("cmc_mercadorias", "2026-09-03", 1000, { status: "cancelado" }), // cancelada: fora, como na DRE
  lanc("cmc_mercadorias", "2026-09-20", 9000), // lançada para depois de hoje: ainda não conta
  lanc("cmc_mercadorias", "2026-10-02", 7000), // outro mês
  lanc("cvv_adquirencia", "2026-09-05", 600),
  lanc("cvv_entregas", "2026-09-15", 100), // hoje conta
  lanc("cmo_freela", "2026-09-12", 500),
  lanc("cmo_folha", "2026-09-05", 4000), // folha fixa: fora do ritmo
  lanc("co_aluguel", "2026-09-05", 3000),
  lanc("cmo_folha", "2026-09-06", 999, { origem: "liquidacao_provisao" }), // nunca entra na DRE
];
const META = { faturamento: 100000, cmvPercentual: 0.3, custosVariaveis: 2000 };

describe("fração do mês decorrida (ritmo diário, só strings ISO)", () => {
  it("mês corrente: dia de hoje ÷ dias do mês, hoje incluso (30 mil no dia 14 = 13,5 mil)", () => {
    expect(fracaoDecorrida("2026-10-14", "2026-10")).toEqual({ diasDecorridos: 14, diasDoMes: 31, fracao: 14 / 31 });
    expect(Math.round(30000 * fracaoDecorrida("2026-10-14", "2026-10").fracao)).toBe(13548);
    expect(fracaoDecorrida("2026-10-01", "2026-10").fracao).toBeCloseTo(1 / 31, 12);
  });
  it("borda do mês: último dia = 1; primeiro dia do mês seguinte deixa o anterior inteiro", () => {
    expect(fracaoDecorrida("2026-10-31", "2026-10").fracao).toBe(1);
    expect(fracaoDecorrida("2026-11-01", "2026-10")).toEqual({ diasDecorridos: 31, diasDoMes: 31, fracao: 1 });
    expect(fracaoDecorrida("2027-01-02", "2026-12")).toEqual({ diasDecorridos: 31, diasDoMes: 31, fracao: 1 });
    expect(fracaoDecorrida("2026-12-31", "2026-12").fracao).toBe(1);
  });
  it("mês anterior ainda aberto = 1; mês futuro = 0", () => {
    expect(fracaoDecorrida("2026-10-13", "2026-09").fracao).toBe(1);
    expect(fracaoDecorrida("2026-10-13", "2026-11")).toEqual({ diasDecorridos: 0, diasDoMes: 30, fracao: 0 });
    expect(fracaoDecorrida("2026-10-13", "2027-01").fracao).toBe(0);
  });
  it("fevereiro: 28 ou 29 dias conforme o ano", () => {
    expect(fracaoDecorrida("2026-02-14", "2026-02")).toEqual({ diasDecorridos: 14, diasDoMes: 28, fracao: 0.5 });
    expect(fracaoDecorrida("2028-02-29", "2028-02").fracao).toBe(1);
  });
});

describe("farol por ritmo (exemplo de Vinícius: 100 mil x 30%, metade do mês = 15 mil)", () => {
  it("dentro do esperado = verde; até 20% acima = amarelo; além = vermelho", () => {
    expect(calcularFarolRitmo(0, 15000, 0.5)).toBe("no_ritmo");
    expect(calcularFarolRitmo(15000, 15000, 0.5)).toBe("no_ritmo");
    expect(calcularFarolRitmo(15000.01, 15000, 0.5)).toBe("acima_do_ritmo");
    expect(calcularFarolRitmo(16500, 15000, 0.5)).toBe("acima_do_ritmo");
    expect(calcularFarolRitmo(18000, 15000, 0.5)).toBe("acima_do_ritmo");
    expect(calcularFarolRitmo(18000.01, 15000, 0.5)).toBe("muito_acima_do_ritmo");
    expect(limiteVermelho(15000)).toBe(18000);
    expect(limiteVermelho(12580.65)).toBe(15096.78);
  });
  it("sem meta = sem cor (nenhuma meta padrão); mês futuro = sem ritmo", () => {
    expect(calcularFarolRitmo(99999, null, 0.5)).toBe("sem_meta");
    expect(calcularFarolRitmo(0, null, 0)).toBe("sem_meta");
    expect(calcularFarolRitmo(0, 15000, 0)).toBe("mes_nao_comecou");
  });
  it("meta de CMV de compras do mês = faturamento x % CMV, só com as duas", () => {
    expect(metaCmvComprasDoMes(META)).toBe(30000);
    expect(metaCmvComprasDoMes({ faturamento: 100000, cmvPercentual: null, custosVariaveis: 1 })).toBeNull();
    expect(metaCmvComprasDoMes({ faturamento: null, cmvPercentual: 0.3, custosVariaveis: 1 })).toBeNull();
    expect(metaCmvComprasDoMes(null)).toBeNull();
  });
});

describe("ritmo do mês com a montagem da DRE", () => {
  it("realizado até hoje por competência: cancelada, futura, outro mês, folha e liquidação ficam fora", () => {
    const ritmo = montarRitmoDoMes({ competencia: "2026-09", hoje: "2026-09-15", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, meta: META });
    expect(ritmo).toMatchObject({ hoje: "2026-09-15", diasDecorridos: 15, diasDoMes: 30, fracao: 0.5 });
    expect(ritmo.cmvCompras).toEqual({
      realizado: 15000,
      comprasMercadorias: 10000,
      comprasEmbalagens: 5000,
      metaDoMes: 30000,
      esperado: 15000,
      limiteVermelho: 18000,
      farol: "no_ritmo",
    });
    // 1.200 = exatamente esperado x 1,2: ainda amarelo.
    expect(ritmo.custosVariaveis).toEqual({
      realizado: 1200,
      custosVendaVariaveis: 700,
      freelancers: 500,
      metaDoMes: 2000,
      esperado: 1000,
      limiteVermelho: 1200,
      farol: "acima_do_ritmo",
    });
  });
  it("mais de 20% acima do ritmo = vermelho (18.000,01 contra 15.000 esperado)", () => {
    const lancamentos = [...LANCAMENTOS, lanc("cmc_embalagens", "2026-09-14", 3000.01)];
    const ritmo = montarRitmoDoMes({ competencia: "2026-09", hoje: "2026-09-15", lancamentos, categorias: CATEGORIAS, meta: META });
    expect(ritmo.cmvCompras.realizado).toBe(18000.01);
    expect(ritmo.cmvCompras.farol).toBe("muito_acima_do_ritmo");
  });
  it("sem meta cadastrada: número sem cor, nada de média automática", () => {
    const ritmo = montarRitmoDoMes({ competencia: "2026-09", hoje: "2026-09-15", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, meta: null });
    expect(ritmo.cmvCompras).toMatchObject({ realizado: 15000, metaDoMes: null, esperado: null, limiteVermelho: null, farol: "sem_meta" });
    expect(ritmo.custosVariaveis).toMatchObject({ realizado: 1200, farol: "sem_meta" });
    const soFaturamento = montarRitmoDoMes({
      competencia: "2026-09",
      hoje: "2026-09-15",
      lancamentos: LANCAMENTOS,
      categorias: CATEGORIAS,
      meta: { faturamento: 100000, cmvPercentual: null, custosVariaveis: null },
    });
    expect(soFaturamento.cmvCompras.farol).toBe("sem_meta");
  });
  it("mês anterior ainda aberto: fração 1, esperado = meta inteira e realizado = CMC da DRE do mês", () => {
    const ritmo = montarRitmoDoMes({ competencia: "2026-09", hoje: "2026-10-13", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, meta: META });
    const dre = calcularDre({ competencia: "2026-09", lancamentos: lancamentosDaDre(LANCAMENTOS), categorias: CATEGORIAS, estoqueMensal: null });
    expect(ritmo.fracao).toBe(1);
    expect(ritmo.cmvCompras.realizado).toBe(dre.cmv.cmc);
    expect(ritmo.cmvCompras.realizado).toBe(24000); // 10000 + 5000 + 9000 (cancelada fora)
    expect(ritmo.cmvCompras).toMatchObject({ esperado: 30000, limiteVermelho: 36000, farol: "no_ritmo" });
    expect(ritmo.custosVariaveis).toMatchObject({ realizado: 1200, esperado: 2000, farol: "no_ritmo" });
  });
  it("mês futuro: nada realizado e sem ritmo, mesmo com meta", () => {
    const ritmo = montarRitmoDoMes({ competencia: "2026-10", hoje: "2026-09-15", lancamentos: LANCAMENTOS, categorias: CATEGORIAS, meta: META });
    expect(ritmo.cmvCompras).toMatchObject({ realizado: 0, metaDoMes: 30000, esperado: 0, farol: "mes_nao_comecou" });
    expect(ritmo.custosVariaveis.farol).toBe("mes_nao_comecou");
  });
  it("freelancer só pela conta de sistema cmo_freelancers: conta própria de folha fica na folha", () => {
    const categorias = CATEGORIAS.map((c) => (c.id === "cmo_freela" ? { ...c, codigoSistema: null } : c));
    const ritmo = montarRitmoDoMes({ competencia: "2026-09", hoje: "2026-09-15", lancamentos: LANCAMENTOS, categorias, meta: META });
    expect(ritmo.custosVariaveis).toMatchObject({ realizado: 700, custosVendaVariaveis: 700, freelancers: 0, farol: "no_ritmo" });
  });
  it("sem o subgrupo de Custos de Venda Variáveis no plano, só o freelancer conta", () => {
    const categorias = CATEGORIAS.filter((c) => c.id !== "sub_cvv");
    const ritmo = montarRitmoDoMes({ competencia: "2026-09", hoje: "2026-09-15", lancamentos: LANCAMENTOS, categorias, meta: META });
    expect(ritmo.custosVariaveis).toMatchObject({ realizado: 500, custosVendaVariaveis: 0, freelancers: 500, farol: "no_ritmo" });
  });
});
