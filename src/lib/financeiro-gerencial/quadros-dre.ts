import type { LinhaDreAnual } from "./dre-anual";
import { somarValores } from "./parcelas";

/** Quadros do topo da DRE (regra de Vinícius, 25/09): resumo de UM mês de
 * competência, independente das Colunas marcadas, com comparativo contra o
 * mês anterior e contra a média dos três meses anteriores (último trimestre
 * fechado). Função pura sobre as linhas anuais já calculadas. */

export type ValorQuadro = {
  /** Valor em R$ (null = mês sem dado). */
  valor: number | null;
  /** Resultados: % da Receita Operacional Bruta. Ponto de Equilíbrio: quanto
   * a receita do mês representa do ponto de equilíbrio (receita ÷ PE). */
  percentual: number | null;
  /** Só Ponto de Equilíbrio: margem de contribuição zero/negativa. */
  semMargem?: boolean;
};

export type Quadro = {
  atual: ValorQuadro;
  mesAnterior: ValorQuadro | null;
  mediaTrimestre: ValorQuadro | null;
};

export type QuadrosDre = {
  mesIndice: number;
  mesesTrimestre: number[];
  resultadoLiquido: Quadro;
  resultadoEconomico: Quadro;
  pontoDeEquilibrio: Quadro;
};

/** Mês do resumo: no ano corrente, o mês corrente; em outro ano, o último
 * mês com algum valor na Receita Operacional Bruta (ou dezembro, se o ano
 * não tem nada). */
export function mesDoResumo(ano: number, linhas: LinhaDreAnual[], hoje: Date = new Date()): number {
  if (ano === hoje.getFullYear()) return hoje.getMonth();
  const receita = linhas.find((l) => l.id === "receita_bruta");
  for (let i = 11; i >= 0; i--) {
    const v = receita?.valoresPorMes[i];
    if (v !== null && v !== undefined && v !== 0) return i;
  }
  return 11;
}

function razao(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Soma (e quantos meses tinham dado) de uma linha nos meses pedidos. */
function somar(linhas: LinhaDreAnual[], id: string, meses: number[]): { soma: number; n: number } {
  const linha = linhas.find((l) => l.id === id);
  const valores = meses.map((i) => linha?.valoresPorMes[i]).filter((v): v is number => v !== null && v !== undefined);
  return { soma: somarValores(valores), n: valores.length };
}

/** Valores de um mês ou da média de vários: valor = soma ÷ nº de meses com
 * dado; percentuais sempre sobre as somas (nunca média de percentuais). */
function valoresDoPeriodo(linhas: LinhaDreAnual[], meses: number[]) {
  const receita = somar(linhas, "receita_bruta", meses);
  if (meses.length === 0 || receita.n === 0) return null;
  const n = receita.n;
  const media = (id: string) => arredondar2(somar(linhas, id, meses).soma / n);
  const receitaMedia = arredondar2(receita.soma / n);
  const resultadoLiquido = media("resultado_liquido");
  const resultadoEconomico = media("resultado_economico");
  const percentualMargem = razao(somar(linhas, "margem", meses).soma, receita.soma);
  const semMargem = percentualMargem === null || percentualMargem <= 0;
  const pontoDeEquilibrio = semMargem ? null : arredondar2(media("custos_fixos") / percentualMargem!);
  return {
    resultadoLiquido: { valor: resultadoLiquido, percentual: razao(resultadoLiquido, receitaMedia) },
    resultadoEconomico: { valor: resultadoEconomico, percentual: razao(resultadoEconomico, receitaMedia) },
    pontoDeEquilibrio: { valor: pontoDeEquilibrio, percentual: razao(receitaMedia, pontoDeEquilibrio), semMargem },
  };
}

export function montarQuadrosDre(linhas: LinhaDreAnual[], mesIndice: number): QuadrosDre {
  const mesesTrimestre = [mesIndice - 3, mesIndice - 2, mesIndice - 1].filter((i) => i >= 0);
  const atual = valoresDoPeriodo(linhas, [mesIndice]);
  const anterior = mesIndice > 0 ? valoresDoPeriodo(linhas, [mesIndice - 1]) : null;
  const trimestre = valoresDoPeriodo(linhas, mesesTrimestre);
  const vazio: ValorQuadro = { valor: null, percentual: null };
  const quadro = (chave: "resultadoLiquido" | "resultadoEconomico" | "pontoDeEquilibrio"): Quadro => ({
    atual: atual?.[chave] ?? vazio,
    mesAnterior: anterior?.[chave] ?? null,
    mediaTrimestre: trimestre?.[chave] ?? null,
  });
  return {
    mesIndice,
    mesesTrimestre,
    resultadoLiquido: quadro("resultadoLiquido"),
    resultadoEconomico: quadro("resultadoEconomico"),
    pontoDeEquilibrio: quadro("pontoDeEquilibrio"),
  };
}
