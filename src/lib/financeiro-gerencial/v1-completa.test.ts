import { describe, expect, it } from "vitest";
import { montarMovimentosCaixa, saldoAte, saldoInicialContas } from "./caixa";
import { calcularDre } from "./dre";
import { calcularProvisaoMes, calcularProvisoes, PARAMETROS_PADRAO_PLANILHA, parametrosVigentes, valoresDreProvisao } from "./provisoes";
import { montarDfcAnual, montarFluxoDiario, montarFluxoMensal } from "./relatorios-caixa";
import type { BaixaBase, CategoriaFinanceira, ContaFinanceira, EstoqueMensal, LancamentoBase, ParametrosProvisaoRegistro } from "./tipos";

function categoria(over: Partial<CategoriaFinanceira> & { id: string }): CategoriaFinanceira {
  return { parentId: null, nivel: "conta", papelDre: null, nome: over.id, codigoSistema: null, padrao: true, ordem: 1, arquivado: false, ...over };
}

const CATEGORIAS: CategoriaFinanceira[] = [
  categoria({ id: "g_receita", nivel: "grupo_principal", papelDre: "receita", nome: "Receita Operacional Bruta", ordem: 1 }),
  categoria({ id: "receita_salao", parentId: "g_receita", papelDre: "receita", nome: "Vendas no salão" }),
  categoria({ id: "g_cmo", nivel: "grupo_principal", papelDre: "cmo", nome: "CMO", ordem: 4 }),
  categoria({ id: "cmo_folha", parentId: "g_cmo", papelDre: "cmo", codigoSistema: "cmo_folha_salarial", nome: "Folha salarial contábil", ordem: 5 }),
  categoria({ id: "cmo_fgts", parentId: "g_cmo", papelDre: "cmo", codigoSistema: "cmo_fgts", nome: "FGTS", ordem: 4 }),
  categoria({ id: "cmo_inss", parentId: "g_cmo", papelDre: "cmo", codigoSistema: "cmo_inss_folha", nome: "INSS folha", ordem: 7 }),
  categoria({ id: "cmo_ferias", parentId: "g_cmo", papelDre: "cmo_ferias", codigoSistema: "cmo_ferias", nome: "Férias", ordem: 3 }),
  categoria({ id: "cmo_13", parentId: "g_cmo", papelDre: "cmo_decimo_terceiro", codigoSistema: "cmo_decimo_terceiro", nome: "13º salário", ordem: 17 }),
  categoria({ id: "cmo_multa", parentId: "g_cmo", papelDre: "cmo_multa_fgts", codigoSistema: "cmo_multa_fgts", nome: "Provisão de multa do FGTS", ordem: 18 }),
  categoria({ id: "g_sno", nivel: "grupo_principal", papelDre: "saida_nao_operacional", nome: "Saídas Não Operacionais", ordem: 6 }),
  categoria({ id: "sno_retiradas", parentId: "g_sno", papelDre: "saida_nao_operacional", codigoSistema: "sno_retiradas_socios", nome: "Retiradas de sócios", ordem: 1 }),
  categoria({ id: "sno_equip", parentId: "g_sno", papelDre: "saida_nao_operacional", codigoSistema: "sno_equipamentos_investimentos", nome: "Compra de equipamentos", ordem: 3 }),
];

let seq = 0;
function lanc(over: Partial<LancamentoBase> & { categoriaId: string; dataCompetencia: string; valores: [number, string, ("aberto" | "cancelado")?][] }): LancamentoBase {
  const id = `l${++seq}`;
  return {
    id,
    tipo: "despesa",
    descricao: "teste",
    origem: "comum",
    recorrenciaId: null,
    ...over,
    parcelas: over.valores.map(([valor, dataPrevista, status], i) => ({
      id: `${id}_p${i + 1}`,
      valor,
      dataPrevista,
      contaFinanceiraId: "banco",
      status: status ?? "aberto",
      numero: i + 1,
      totalParcelas: over.valores.length,
    })),
  };
}

const CONTAS: ContaFinanceira[] = [{ id: "banco", nome: "Banco", tipo: "banco", saldoInicial: 1000, dataSaldoInicial: "2026-01-01", ativo: true }];

describe("Caixa projetado x realizado (critério 5)", () => {
  const venda = lanc({ tipo: "receita", categoriaId: "receita_salao", dataCompetencia: "2026-09-01", valores: [[500, "2026-09-10"]] });
  const aluguel = lanc({ categoriaId: "cmo_folha", dataCompetencia: "2026-09-01", valores: [[300, "2026-09-05"], [300, "2026-10-05"]] });
  const cancelada = lanc({ categoriaId: "cmo_folha", dataCompetencia: "2026-09-01", valores: [[999, "2026-09-06", "cancelado"]] });
  const baixas: BaixaBase[] = [
    { id: "b1", parcelaId: aluguel.parcelas[0].id, tipo: "baixa", contaFinanceiraId: "banco", valor: 300, data: "2026-09-07" },
    { id: "b2", parcelaId: venda.parcelas[0].id, tipo: "baixa", contaFinanceiraId: "banco", valor: 200, data: "2026-09-10" },
    { id: "b3", parcelaId: venda.parcelas[0].id, tipo: "estorno", contaFinanceiraId: "banco", valor: 200, data: "2026-09-11" },
  ];
  const lancamentos = [venda, aluguel, cancelada];
  const base = saldoInicialContas(CONTAS);

  it("projetado usa data prevista e valor cheio, ignora parcela cancelada", () => {
    const mov = montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas });
    expect(saldoAte(base, mov, "2026-09-30")).toBe(1000 + 500 - 300);
    expect(mov.some((m) => m.valor === -999)).toBe(false);
  });

  it("realizado usa só baixas pela data efetiva e o estorno subtrai", () => {
    const mov = montarMovimentosCaixa({ visao: "realizado", lancamentos, baixas });
    expect(saldoAte(base, mov, "2026-09-10")).toBe(1000 - 300 + 200);
    expect(saldoAte(base, mov, "2026-09-30")).toBe(700);
  });

  it("com título em aberto os dois saldos são diferentes", () => {
    const proj = saldoAte(base, montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas }), "2026-09-30");
    const real = saldoAte(base, montarMovimentosCaixa({ visao: "realizado", lancamentos, baixas }), "2026-09-30");
    expect(proj).not.toBe(real);
  });

  it("fluxo diário acumula a partir do saldo do começo do mês e o mensal fecha no mesmo saldo", () => {
    const mov = montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas });
    const diario = montarFluxoDiario({ ano: 2026, mesIndice0: 8, movimentos: mov, saldoBase: base });
    expect(diario.saldoInicial).toBe(1000);
    expect(diario.dias).toHaveLength(30);
    expect(diario.dias[29].saldoAcumulado).toBe(1200);
    const mensal = montarFluxoMensal({ ano: 2026, movimentos: mov, categorias: CATEGORIAS, saldoBase: base, divisorMedia: 12 });
    const saldoFinal = mensal.find((l) => l.id === "saldo_final")!;
    expect(saldoFinal.valoresPorMes[8]).toBe(1200);
    expect(saldoFinal.valoresPorMes[9]).toBe(900);
    expect(saldoFinal.total).toBe(900);
  });
});

describe("DFC método direto (critérios 6 e 7)", () => {
  const venda = lanc({ tipo: "receita", categoriaId: "receita_salao", dataCompetencia: "2026-03-01", valores: [[1000, "2026-03-10"]] });
  const retirada = lanc({ categoriaId: "sno_retiradas", dataCompetencia: "2026-03-01", valores: [[200, "2026-03-15"]] });
  const equipamento = lanc({ categoriaId: "sno_equip", dataCompetencia: "2026-03-01", valores: [[100, "2026-03-20"]] });
  const lancamentos = [venda, retirada, equipamento];

  it("Saídas Não Operacionais reduzem o caixa (investimento e financiamento) mas não o Resultado da DRE", () => {
    const mov = montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas: [] });
    const dfc = montarDfcAnual({ ano: 2026, movimentos: mov, categorias: CATEGORIAS, saldoBase: 0, divisorMedia: 12 });
    const linha = (id: string) => dfc.find((l) => l.id === id)!;
    expect(linha("caixa_operacional").valoresPorMes[2]).toBe(1000);
    expect(linha("investimento").valoresPorMes[2]).toBe(100);
    expect(linha("financiamento").valoresPorMes[2]).toBe(200);
    expect(linha("geracao_caixa").valoresPorMes[2]).toBe(700);

    const estoque: EstoqueMensal = { id: "e", competencia: "2026-03-01", receitaVendasProdutos: 0, estoqueInicialMercadorias: 0, estoqueInicialEmbalagens: 0, estoqueFinalMercadorias: 0, estoqueFinalEmbalagens: 0, criadoPorNome: "", atualizadoEm: "" };
    const dre = calcularDre({ competencia: "2026-03", lancamentos, categorias: CATEGORIAS, estoqueMensal: estoque });
    expect(dre.resultadoOperacional).toBe(1000);
  });

  it("modo resumido = só grupos; expandido abre contas (filhos presentes)", () => {
    const mov = montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas: [] });
    const dfc = montarDfcAnual({ ano: 2026, movimentos: mov, categorias: CATEGORIAS, saldoBase: 0, divisorMedia: 12 });
    expect(dfc.every((l) => l.nivel === 0)).toBe(true);
    expect(dfc.find((l) => l.id === "financiamento")!.filhos!.map((f) => f.rotulo)).toEqual(["Retiradas de sócios"]);
  });
});

describe("Provisões trabalhistas (critério 2 e planilha)", () => {
  it("reproduz as fórmulas da planilha Financeiro Zatti", () => {
    const calc = calcularProvisaoMes({ folha: 12000, fgts: 960, inss: 2400 }, PARAMETROS_PADRAO_PLANILHA);
    // Férias = F/12 + (F/12)/3 + I/12 + G/12
    expect(calc.porTipo.ferias).toBeCloseTo(1000 + 333.33 + 200 + 80, 1);
    // 13º = F/12 + I/12 + G/12
    expect(calc.porTipo.decimo_terceiro).toBeCloseTo(1000 + 280, 1);
    // Multa = G/2
    expect(calc.porTipo.multa_fgts).toBe(480);
  });

  const folha = (comp: string) => lanc({ categoriaId: "cmo_folha", dataCompetencia: `${comp}-01`, valores: [[12000, `${comp}-05`]] });

  it("liquidação reduz o saldo, entra no caixa e não duplica a DRE; excesso vira ajuste", () => {
    const guia = lanc({ categoriaId: "cmo_13", origem: "liquidacao_provisao", dataCompetencia: "2026-03-01", valores: [[3500, "2026-03-20"]] });
    const lancamentos = [folha("2026-01"), folha("2026-02"), folha("2026-03"), guia];
    const provisoes = calcularProvisoes({ lancamentos, categorias: CATEGORIAS, parametros: [], reversoes: [], ateCompetencia: "2026-03" });
    const marco = provisoes.get("2026-03")!.porTipo.decimo_terceiro;
    // 3 meses x 1000 = 3000 provisionado; guia de 3500 -> excesso 500
    expect(marco.saldoInicial).toBe(2000);
    expect(marco.provisao).toBe(1000);
    expect(marco.excesso).toBe(500);
    expect(marco.saldoFinal).toBe(0);
    expect(marco.valorDre).toBe(1500);

    const estoque: EstoqueMensal = { id: "e", competencia: "2026-03-01", receitaVendasProdutos: 0, estoqueInicialMercadorias: 0, estoqueInicialEmbalagens: 0, estoqueFinalMercadorias: 0, estoqueFinalEmbalagens: 0, criadoPorNome: "", atualizadoEm: "" };
    const dre = calcularDre({
      competencia: "2026-03",
      lancamentos,
      categorias: CATEGORIAS,
      estoqueMensal: estoque,
      valoresProvisao: valoresDreProvisao(provisoes.get("2026-03"), CATEGORIAS),
    });
    const linha13 = dre.cmo.contas.find((c) => c.id === "cmo_13")!;
    expect(linha13.valor).toBe(1500);

    const caixa = montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas: [] });
    expect(caixa.some((m) => m.lancamentoId === guia.id && m.valor === -3500)).toBe(true);
  });

  it("liquidação menor que o saldo não gera ajuste e o saldo fica; reversão reduz saldo e DRE", () => {
    const guia = lanc({ categoriaId: "cmo_13", origem: "liquidacao_provisao", dataCompetencia: "2026-02-01", valores: [[1500, "2026-02-20"]] });
    const provisoes = calcularProvisoes({
      lancamentos: [folha("2026-01"), folha("2026-02"), guia],
      categorias: CATEGORIAS,
      parametros: [],
      reversoes: [{ id: "r", tipo: "decimo_terceiro", competencia: "2026-03-01", valor: 200, motivo: "sobra", criadoPorNome: "", criadoEm: "" }],
      ateCompetencia: "2026-03",
    });
    expect(provisoes.get("2026-02")!.porTipo.decimo_terceiro.excesso).toBe(0);
    expect(provisoes.get("2026-02")!.porTipo.decimo_terceiro.saldoFinal).toBe(500);
    const marco = provisoes.get("2026-03")!.porTipo.decimo_terceiro;
    expect(marco.saldoFinal).toBe(300);
    expect(marco.valorDre).toBe(-200);
  });

  it("parâmetro vigente é a linha mais recente até a competência, sem linha vale a planilha", () => {
    const registro = (vigenteDesde: string, pct: number): ParametrosProvisaoRegistro => ({
      ...PARAMETROS_PADRAO_PLANILHA,
      percentualMultaFgts: pct,
      id: vigenteDesde,
      vigenteDesde,
      criadoPorNome: "",
      criadoEm: `${vigenteDesde}T00:00:00Z`,
    });
    const lista = [registro("2026-05-01", 40), registro("2026-08-01", 45)];
    expect(parametrosVigentes(lista, "2026-04").percentualMultaFgts).toBe(50);
    expect(parametrosVigentes(lista, "2026-06").percentualMultaFgts).toBe(40);
    expect(parametrosVigentes(lista, "2026-09").percentualMultaFgts).toBe(45);
  });
});

describe("Visão geral", () => {
  it("separa realizado de projetado e soma aberto/vencido pelo saldo em aberto da parcela", async () => {
    const { montarVisaoGeral } = await import("./visao-geral");
    const venda = lanc({ tipo: "receita", categoriaId: "receita_salao", dataCompetencia: "2026-09-01", valores: [[500, "2026-09-10"]] });
    const conta = lanc({ categoriaId: "cmo_folha", dataCompetencia: "2026-09-01", valores: [[300, "2026-09-25"], [100, "2026-09-30", "cancelado"]] });
    const baixas: BaixaBase[] = [{ id: "b", parcelaId: venda.parcelas[0].id, tipo: "baixa", contaFinanceiraId: "banco", valor: 200, data: "2026-09-10" }];
    const visao = montarVisaoGeral({ hoje: "2026-09-22", lancamentos: [venda, conta], baixas, contas: CONTAS });
    expect(visao.saldoRealizadoHoje).toBe(1200);
    expect(visao.saldoProjetadoFimDoMes).toBe(1200);
    expect(visao.aReceberNoMes).toBe(300);
    expect(visao.vencidoAReceber).toBe(300);
    expect(visao.aPagarNoMes).toBe(300);
    expect(visao.vencidoAPagar).toBe(0);
    expect(visao.proximosVencimentos.map((t) => t.dataPrevista)).toEqual(["2026-09-25"]);
  });
});
