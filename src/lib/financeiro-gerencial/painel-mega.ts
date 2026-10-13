import { aberturasDasContas, montarMovimentosCaixa, saldoAte } from "./caixa";
import { mesUsaPercentualCmv, type DreAnual, type LinhaDreAnual } from "./dre-anual";
import { montarQuadrosDre, type ValorQuadro } from "./quadros-dre";
import type { BaixaBase, ContaFinanceira, LancamentoBase } from "./tipos";

/** Painel M.E.G.A. com farol (Financeiro V2, Fase 3, item 3, 13/10). Nenhuma
 * fórmula nova: todo número sai da DRE anual já calculada
 * (`montarDreAnualDaUnidade`) e o Ponto de Equilíbrio do mesmo quadro da DRE
 * (`montarQuadrosDre`). O farol só existe onde a gestão cadastrou meta;
 * nenhum limite padrão. */

/** Meta da unidade vigente a partir de `vigenteDesde` ("AAAA-MM-01").
 * Percentuais em fração (0.32 = 32%), igual à DRE. `null` = sem meta. */
export type MetaUnidade = {
  vigenteDesde: string;
  faturamento: number | null;
  cmvPercentual: number | null;
  custoFixoPercentual: number | null;
  resultado: number | null;
};

/** Meta vigente no mês `competencia` ("AAAA-MM"): a de início no próprio mês
 * ou no mês anterior mais recente. A vigência é a linha inteira: campo nulo
 * nela = sem meta naquele indicador a partir daquele mês. */
export function metaVigente(metas: MetaUnidade[], competencia: string): MetaUnidade | null {
  const alvo = `${competencia}-01`;
  let escolhida: MetaUnidade | null = null;
  for (const meta of metas) {
    if (meta.vigenteDesde > alvo) continue;
    if (!escolhida || meta.vigenteDesde > escolhida.vigenteDesde) escolhida = meta;
  }
  return escolhida;
}

/** Piso: cumpre com valor >= meta (faturamento, resultado). Teto: cumpre com
 * valor <= meta (% CMV, % custos fixos). */
export type SentidoMeta = "piso" | "teto";

export type Farol = "cumpre" | "nao_cumpre" | "sem_meta" | "sem_valor" | "provisorio";

export function calcularFarol(valor: number | null, meta: number | null, sentido: SentidoMeta): Farol {
  if (meta === null) return "sem_meta";
  if (valor === null) return "sem_valor";
  const cumpre = sentido === "piso" ? valor >= meta : valor <= meta;
  return cumpre ? "cumpre" : "nao_cumpre";
}

export type IndicadorComFarol = {
  valor: number | null;
  meta: number | null;
  farol: Farol;
};

export type PainelMega = {
  competencia: string;
  mesIndice: number;
  /** Mês ainda não começado: valores são previsão (como na DRE). */
  previsao: boolean;
  metaVigenteDesde: string | null;
  faturamento: IndicadorComFarol;
  /** `percentualCmvFechado` false = a DRE mostra o % CMC provisório nesse mês;
   * o farol fica "provisorio" (sem cor) para não comparar CMC com meta de CMV. */
  cmvPercentual: IndicadorComFarol & { percentualCmvFechado: boolean };
  margemContribuicao: { valor: number | null; percentual: number | null };
  custoFixoPercentual: IndicadorComFarol & { custosFixos: number | null };
  pontoDeEquilibrio: ValorQuadro;
  resultado: IndicadorComFarol & { percentual: number | null };
  caixaProjetado30Dias: { data: string; saldo: number };
};

function valorDaLinha(linhas: LinhaDreAnual[], id: string, mesIndice: number): number | null {
  return linhas.find((l) => l.id === id)?.valoresPorMes[mesIndice] ?? null;
}

export function montarPainelMega(params: {
  dreAnual: DreAnual;
  mesIndice: number;
  receitaVendasProdutosPorMes: number[];
  metas: MetaUnidade[];
  caixaProjetado30Dias: { data: string; saldo: number };
}): PainelMega {
  const { dreAnual, mesIndice, receitaVendasProdutosPorMes, metas, caixaProjetado30Dias } = params;
  const linhas = dreAnual.linhas;
  const competencia = `${dreAnual.ano}-${String(mesIndice + 1).padStart(2, "0")}`;
  const meta = metaVigente(metas, competencia);
  const v = (id: string) => valorDaLinha(linhas, id, mesIndice);

  const faturamento = v("receita_bruta");
  const cmvPercentual = v("cmv_percentual");
  const percentualCmvFechado = mesUsaPercentualCmv(dreAnual.cmvProvisorioPorMes[mesIndice], receitaVendasProdutosPorMes[mesIndice]);
  const custoFixoPercentual = v("custos_fixos_percentual");
  const resultado = v("resultado_liquido");
  const metaCmv = meta?.cmvPercentual ?? null;

  return {
    competencia,
    mesIndice,
    previsao: mesIndice >= dreAnual.primeiroMesPrevisto,
    metaVigenteDesde: meta?.vigenteDesde ?? null,
    faturamento: { valor: faturamento, meta: meta?.faturamento ?? null, farol: calcularFarol(faturamento, meta?.faturamento ?? null, "piso") },
    cmvPercentual: {
      valor: cmvPercentual,
      meta: metaCmv,
      farol: metaCmv !== null && !percentualCmvFechado ? "provisorio" : calcularFarol(cmvPercentual, metaCmv, "teto"),
      percentualCmvFechado,
    },
    margemContribuicao: { valor: v("margem"), percentual: v("margem_percentual") },
    custoFixoPercentual: {
      valor: custoFixoPercentual,
      meta: meta?.custoFixoPercentual ?? null,
      farol: calcularFarol(custoFixoPercentual, meta?.custoFixoPercentual ?? null, "teto"),
      custosFixos: v("custos_fixos"),
    },
    pontoDeEquilibrio: montarQuadrosDre(linhas, mesIndice).pontoDeEquilibrio.atual,
    resultado: {
      valor: resultado,
      meta: meta?.resultado ?? null,
      farol: calcularFarol(resultado, meta?.resultado ?? null, "piso"),
      percentual: v("resultado_liquido_percentual"),
    },
    caixaProjetado30Dias,
  };
}

/** "AAAA-MM-DD" + n dias (calendário, sem fuso). */
function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Caixa projetado em `dias` dias: o mesmo saldo do Fluxo de Caixa projetado,
 * todas as contas (`montarMovimentosCaixa` projetado + `saldoAte`), no fim
 * do dia hoje + `dias`. Mesma montagem da Visão geral, só com outra data. */
export function caixaProjetadoEmDias(params: {
  hoje: string;
  dias: number;
  lancamentos: LancamentoBase[];
  baixas: BaixaBase[];
  contas: ContaFinanceira[];
}): { data: string; saldo: number } {
  const { hoje, dias, lancamentos, baixas, contas } = params;
  const data = somarDias(hoje, dias);
  const movimentos = montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas, contas });
  return { data, saldo: saldoAte(aberturasDasContas(contas), movimentos, data) };
}
