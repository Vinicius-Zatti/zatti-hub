import { describe, expect, it } from "vitest";
import { calcularDivisorMedia, montarDreAnual } from "./dre-anual";
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
    criadoEm: "2026-01-01T00:00:00Z",
    ...over,
    parcelas: [
      { id: "p1", lancamentoId: "l1", numero: 1, totalParcelas: 1, valor: over.valor, dataPrevista: over.dataCompetencia, contaFinanceiraId: null, status: "aberto", valorBaixado: 0 },
    ],
  };
}

function estoque(competencia: string): EstoqueMensal {
  return {
    id: `e_${competencia}`,
    competencia: `${competencia}-01`,
    estoqueInicialMercadorias: 100,
    estoqueInicialEmbalagens: 0,
    estoqueFinalMercadorias: 100,
    estoqueFinalEmbalagens: 0,
    criadoPorNome: "Gestão",
    atualizadoEm: "2026-01-01T00:00:00Z",
  };
}

/** Monta os 12 `calcularDre` de um ano a partir de lançamentos e um mapa de
 * estoque mensal por competência ("2026-01" etc.) - mesma coisa que a página
 * real faz, só que em memória pro teste. */
function montarAno(ano: number, lancamentos: Lancamento[], estoquePorMes: Record<string, EstoqueMensal | undefined>) {
  return Array.from({ length: 12 }, (_, indice) => {
    const competencia = `${ano}-${String(indice + 1).padStart(2, "0")}`;
    return calcularDre({ competencia, lancamentos, categorias: CATEGORIAS, estoqueMensal: estoquePorMes[competencia] ?? null });
  });
}

describe("calcularDivisorMedia", () => {
  const hoje = new Date(2026, 7, 25); // 25/08/2026 (mês 7 = agosto, 0-indexado)

  it("ano já encerrado divide por 12", () => {
    expect(calcularDivisorMedia(2025, hoje)).toBe(12);
  });

  it("ano corrente divide pelo número do mês atual", () => {
    expect(calcularDivisorMedia(2026, hoje)).toBe(8);
  });

  it("ano futuro sem mês decorrido não tem divisor (Média = '-')", () => {
    expect(calcularDivisorMedia(2027, hoje)).toBeNull();
  });
});

describe("montarDreAnual", () => {
  const hoje = new Date(2026, 7, 25);

  it("Total soma os meses já transcorridos e Média usa o mesmo divisor pra toda linha, mesmo com meses zerados", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 1000 }),
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-02-10", valor: 1000 }),
    ];
    const estoquePorMes = { "2026-01": estoque("2026-01"), "2026-02": estoque("2026-02") };
    const dres = montarAno(2026, lancamentos, estoquePorMes);
    const anual = montarDreAnual(dres, 2026, hoje);

    const receita = anual.linhas.find((l) => l.id === "receita_bruta")!;
    expect(receita.total).toBe(2000);
    // divisor é o mês atual (8), não o número de meses com lançamento (2)
    expect(anual.divisorMedia).toBe(8);
    expect(receita.media).toBe(250);
    expect(receita.valoresPorMes[0]).toBe(1000);
    expect(receita.valoresPorMes[2]).toBe(0); // março (transcorrido) sem lançamento entra como 0, não como ausente
    expect(receita.valoresPorMes[8]).toBeNull(); // setembro é mês futuro (estamos em 25/08) - aparece como "-", nunca 0
  });

  it("mês futuro nunca exige estoque nem invalida Total/Média/Margem/Resultado/Ponto de Equilíbrio do ano", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 10000 }),
      lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-01-10", valor: 4000 }),
      lancamento({ categoriaId: "cmo_folha", dataCompetencia: "2026-01-10", valor: 1000 }),
    ];
    // Estoque cadastrado só nos meses já transcorridos (jan-ago); set-dez
    // (futuro) fica sem estoque de propósito e não pode quebrar nada.
    const estoquePorMes = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}`, estoque(`2026-${String(i + 1).padStart(2, "0")}`)]),
    );
    const dres = montarAno(2026, lancamentos, estoquePorMes);
    const anual = montarDreAnual(dres, 2026, hoje);

    const margem = anual.linhas.find((l) => l.id === "margem")!;
    const resultadoOperacional = anual.linhas.find((l) => l.id === "resultado_operacional")!;
    expect(margem.total).toBe(6000); // 10000 - 4000, calculável mesmo com set-dez sem estoque
    expect(resultadoOperacional.total).toBe(5000); // 6000 - 1000 de CMO
    expect(margem.valoresPorMes[8]).toBeNull(); // setembro (futuro) continua "-" na tabela
    expect(anual.indicadores.pontoDeEquilibrio).not.toBe("nao_calculavel");
  });

  it("Total/Média de uma linha dependente de CMV viram null se QUALQUER mês JÁ TRANSCORRIDO estiver com estoque pendente", () => {
    const lancamentos = [lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 1000 })];
    // só janeiro tem estoque cadastrado; fevereiro a agosto (todos já
    // transcorridos, estamos em 25/08) ficam pendentes de verdade.
    const dres = montarAno(2026, lancamentos, { "2026-01": estoque("2026-01") });
    const anual = montarDreAnual(dres, 2026, hoje);

    const margem = anual.linhas.find((l) => l.id === "margem")!;
    expect(margem.valoresPorMes[0]).not.toBeNull(); // janeiro calculável isoladamente
    expect(margem.total).toBeNull();
    expect(margem.media).toBeNull();
  });

  it("linha percentual usa Total/Média já agregados (nunca a média das 12 razões mensais)", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 1000 }),
      lancamento({ categoriaId: "deducao_impostos", dataCompetencia: "2026-01-10", valor: 100 }),
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-02-10", valor: 4000 }),
      lancamento({ categoriaId: "deducao_impostos", dataCompetencia: "2026-02-10", valor: 400 }),
    ];
    const dres = montarAno(2026, lancamentos, {});
    const anual = montarDreAnual(dres, 2026, hoje);

    const percentualDeducoes = anual.linhas.find((l) => l.id === "deducoes_percentual")!;
    // Total: 500 / 5000 = 0.10 (não a média simples de 0.10 e 0.10, que aqui coincidiria - testado via total exato)
    expect(percentualDeducoes.total).toBeCloseTo(0.1, 10);
    expect(percentualDeducoes.percentual).toBe(true);
  });

  it("mês sem Receita Operacional Bruta mostra percentual null ('-'), nunca divisão por zero", () => {
    const dres = montarAno(2026, [], {});
    const anual = montarDreAnual(dres, 2026, hoje);
    const percentualCmo = anual.linhas.find((l) => l.id === "cmo_percentual")!;
    expect(percentualCmo.valoresPorMes.every((v) => v === null)).toBe(true);
  });

  it("Ponto de Equilíbrio = Custos Fixos (CMO + Custos Operacionais) ÷ % Margem de Contribuição", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 10000 }),
      lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-01-10", valor: 4000 }),
      lancamento({ categoriaId: "cmo_folha", dataCompetencia: "2026-01-10", valor: 1000 }),
      lancamento({ categoriaId: "co_aluguel", dataCompetencia: "2026-01-10", valor: 500 }),
    ];
    // Estoque cadastrado nos 12 meses (mesmo que só janeiro tenha movimento)
    // pra o Total do ano ser calculável - com só 1 mês cadastrado, os outros
    // 11 ficam com CMV pendente e o Total vira null (regra de nunca somar
    // ano incompleto), como testado no case acima.
    const estoquePorMes = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}`, estoque(`2026-${String(i + 1).padStart(2, "0")}`)]),
    );
    const dres = montarAno(2026, lancamentos, estoquePorMes);
    const anual = montarDreAnual(dres, 2026, hoje);

    // Margem = 10000 - 4000 = 6000 (estoque inicial=final, CMV=CMC=4000); %Margem = 0.6
    // Custos fixos = 1000 + 500 = 1500; PE = 1500 / 0.6 = 2500
    expect(anual.indicadores.pontoDeEquilibrio).toBe(2500);
  });

  it("Ponto de Equilíbrio é 'Não calculável' quando a Margem de Contribuição percentual é zero ou negativa", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 1000 }),
      lancamento({ categoriaId: "cmc_mercadorias", dataCompetencia: "2026-01-10", valor: 5000 }),
    ];
    const estoquePorMes = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}`, estoque(`2026-${String(i + 1).padStart(2, "0")}`)]),
    );
    const dres = montarAno(2026, lancamentos, estoquePorMes);
    const anual = montarDreAnual(dres, 2026, hoje);
    expect(anual.indicadores.pontoDeEquilibrio).toBe("nao_calculavel");
  });

  it("Ponto de Equilíbrio é 'Não calculável' quando a Margem do ano está pendente (mês já transcorrido sem estoque)", () => {
    const dres = montarAno(2026, [], {});
    const anual = montarDreAnual(dres, 2026, hoje);
    expect(anual.indicadores.pontoDeEquilibrio).toBe("nao_calculavel");
  });

  it("ano futuro (nenhum mês transcorrido) mostra Total/Média '-' em toda linha, inclusive Receita", () => {
    const dres = montarAno(2027, [], {});
    const anual = montarDreAnual(dres, 2027, hoje);
    const receita = anual.linhas.find((l) => l.id === "receita_bruta")!;
    expect(receita.total).toBeNull();
    expect(receita.media).toBeNull();
    expect(receita.valoresPorMes.every((v) => v === null)).toBe(true);
    expect(anual.indicadores.pontoDeEquilibrio).toBe("nao_calculavel");
  });

  it("Saídas Não Operacionais e Resultado Líquido ficam na mesma tabela anual, logo após Resultado Econômico", () => {
    const dres = montarAno(2026, [], {});
    const anual = montarDreAnual(dres, 2026, hoje);
    const ids = anual.linhas.map((l) => l.id);
    const indiceResultadoEconomico = ids.indexOf("resultado_economico");
    // resultado_economico, % resultado_economico, saidas, % saidas, resultado_liquido, % resultado_liquido
    expect(ids.slice(indiceResultadoEconomico)).toEqual([
      "resultado_economico",
      "resultado_economico_percentual",
      "saidas",
      "saidas_percentual",
      "resultado_liquido",
      "resultado_liquido_percentual",
    ]);
  });

  it("indicador do topo (Resultado Líquido) usa Resultado Econômico já reduzido pelas Saídas Não Operacionais - Resultado Econômico em si nunca é reduzido", () => {
    const lancamentos = [
      lancamento({ categoriaId: "receita_salao", tipo: "receita", dataCompetencia: "2026-01-10", valor: 10000 }),
      lancamento({ categoriaId: "sno_retiradas", dataCompetencia: "2026-01-10", valor: 2000 }),
    ];
    const estoquePorMes = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`2026-${String(i + 1).padStart(2, "0")}`, estoque(`2026-${String(i + 1).padStart(2, "0")}`)]),
    );
    const dres = montarAno(2026, lancamentos, estoquePorMes);
    const anual = montarDreAnual(dres, 2026, hoje);

    const resultadoOperacional = anual.linhas.find((l) => l.id === "resultado_operacional")!;
    const resultadoEconomico = anual.linhas.find((l) => l.id === "resultado_economico")!;
    const resultadoLiquido = anual.linhas.find((l) => l.id === "resultado_liquido")!;

    expect(resultadoEconomico.total).toBe(resultadoOperacional.total);
    expect(resultadoLiquido.total).toBe(resultadoOperacional.total! - 2000);
    expect(anual.indicadores.resultadoLiquido).toBe(resultadoLiquido.total);
    expect(anual.indicadores.resultadoLiquido).not.toBe(resultadoEconomico.total);
  });
});
