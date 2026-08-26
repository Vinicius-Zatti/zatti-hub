import type { Dre } from "./dre";
import { montarArvoreMensal, type LinhaDreMensal } from "./dre-linhas";
import { somarValores } from "./parcelas";

export const MESES_ABREVIADOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

export type LinhaDreAnual = {
  id: string;
  rotulo: string;
  nivel: 0 | 1 | 2;
  destaque?: boolean;
  percentual?: boolean;
  valoresPorMes: (number | null)[];
  total: number | null;
  media: number | null;
  filhos?: LinhaDreAnual[];
};

export type IndicadoresDre = {
  resultadoEconomico: number | null;
  percentualResultadoEconomico: number | null;
  pontoDeEquilibrio: number | "nao_calculavel";
};

export type DreAnual = {
  ano: number;
  divisorMedia: number | null;
  principal: LinhaDreAnual[];
  indicador: LinhaDreAnual[];
  indicadores: IndicadoresDre;
};

/** Ano já encerrado (antes do ano corrente) divide por 12; ano corrente
 * divide pelo número do mês atual (ex: agosto = 8), igual pra toda linha da
 * DRE - nunca pelo número de meses em que aquela conta teve movimento; ano
 * futuro ainda sem nenhum mês decorrido não tem Média (`null` = "-"). Aceita
 * `hoje` só pra dar pra testar sem depender do relógio real. */
export function calcularDivisorMedia(ano: number, hoje: Date = new Date()): number | null {
  const anoAtual = hoje.getFullYear();
  if (ano < anoAtual) return 12;
  if (ano > anoAtual) return null;
  return hoje.getMonth() + 1;
}

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Total nunca finge um mês pendente (CMV sem estoque cadastrado) como 0 -
 * se qualquer um dos meses considerados vier `null` pra essa linha, o Total
 * inteiro vem `null` também (nunca um cálculo enganoso, mesmo que pareça um
 * número "quase certo"). Recebe só os meses já transcorridos - mês futuro
 * nunca entra aqui, então nunca pode invalidar o Total (ver `mesesValidos`
 * em `combinarArvore`). */
function somarOuNulo(valores: (number | null)[]): number | null {
  if (valores.length === 0) return null;
  if (valores.some((v) => v === null)) return null;
  return somarValores(valores as number[]);
}

function dividirMonetario(total: number | null, divisor: number | null): number | null {
  if (total === null || divisor === null || divisor === 0) return null;
  return arredondar2(total / divisor);
}

/** Divisão de razão (percentual) - sem arredondar pra centavo, o formatador
 * de exibição decide as casas do percentual. */
function dividirRazao(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/** Combina as 12 árvores mensais (mesma forma sempre - mesmas categorias o
 * ano inteiro, só o valor muda) numa árvore anual com Total/Média por linha.
 * Assume que `arvoresDoAno[m][i]` é a mesma conta em todo mês `m` (garantido
 * por `montarArvoreMensal` derivar a estrutura só de `categorias`, que não
 * varia mês a mês).
 *
 * `mesesValidos` (0-12) é quantos meses do início do ano já transcorreram -
 * mês futuro (índice >= mesesValidos) nunca exige estoque, nunca entra no
 * Total/Média (nem soma 0, nem invalida com `null`) e aparece na tabela como
 * "-" mesmo que a linha em si nunca seja nula (ex: Receita, sempre um número
 * real, mas ainda não aconteceu nesse mês futuro). */
function combinarArvore(arvoresDoAno: LinhaDreMensal[][], mesesValidos: number, divisorMedia: number | null): LinhaDreAnual[] {
  const referencia = arvoresDoAno[0];
  return referencia.map((linhaRef, indice) => {
    const valoresBrutos = arvoresDoAno.map((mes) => mes[indice].valor);
    const valoresPorMes = valoresBrutos.map((v, mesIndice) => (mesIndice < mesesValidos ? v : null));
    const total = mesesValidos === 0 ? null : somarOuNulo(valoresBrutos.slice(0, mesesValidos));
    const media = dividirMonetario(total, divisorMedia);
    const filhos = linhaRef.filhos
      ? combinarArvore(
          arvoresDoAno.map((mes) => mes[indice].filhos ?? []),
          mesesValidos,
          divisorMedia,
        )
      : undefined;
    return { id: linhaRef.id, rotulo: linhaRef.rotulo, nivel: linhaRef.nivel, destaque: linhaRef.destaque, valoresPorMes, total, media, filhos };
  });
}

const ROTULOS_PERCENTUAL: Record<string, string> = {
  deducoes: "% Deduções",
  cmv: "% CMV",
  margem: "% Margem de Contribuição",
  cmo: "% CMO",
  custos_operacionais: "% Custos Operacionais",
  saidas: "% Saídas Não Operacionais",
  resultado_economico: "% Resultado Econômico",
};

/** Linha de percentual (frente à Receita Operacional Bruta) - Total e Média
 * são a divisão dos Totais/Médias já agregados, nunca a média das 12 razões
 * mensais (regra explícita: "Total da linha ÷ Total da Receita", "Média da
 * linha ÷ Média da Receita"). Mês sem Receita Bruta mostra "-", nunca 0/0. */
function linhaPercentual(linha: LinhaDreAnual, receitaBruta: LinhaDreAnual): LinhaDreAnual {
  return {
    id: `${linha.id}_percentual`,
    rotulo: ROTULOS_PERCENTUAL[linha.id] ?? `% ${linha.rotulo}`,
    nivel: linha.nivel,
    percentual: true,
    valoresPorMes: linha.valoresPorMes.map((v, indice) => dividirRazao(v, receitaBruta.valoresPorMes[indice])),
    total: dividirRazao(linha.total, receitaBruta.total),
    media: dividirRazao(linha.media, receitaBruta.media),
  };
}

function comPercentuais(linhas: LinhaDreAnual[], idsComPercentual: string[], receitaBruta: LinhaDreAnual): LinhaDreAnual[] {
  return linhas.flatMap((linha) => (idsComPercentual.includes(linha.id) ? [linha, linhaPercentual(linha, receitaBruta)] : [linha]));
}

/** Monta a DRE anual a partir de 12 `Dre` já calculados (índice 0 = janeiro
 * ... 11 = dezembro, todos pelo motor `calcularDre` sem nenhuma alteração de
 * fórmula) - função de apresentação/análise pura, agrega o que o motor já
 * calculou mês a mês. */
export function montarDreAnual(dresPorMes: Dre[], ano: number, hoje: Date = new Date()): DreAnual {
  const divisorMedia = calcularDivisorMedia(ano, hoje);
  const mesesValidos = divisorMedia ?? 0;
  const arvoresMensais = dresPorMes.map((dre) => montarArvoreMensal(dre));

  const principalAbsoluto = combinarArvore(
    arvoresMensais.map((a) => a.principal),
    mesesValidos,
    divisorMedia,
  );
  const indicadorAbsoluto = combinarArvore(
    arvoresMensais.map((a) => a.indicador),
    mesesValidos,
    divisorMedia,
  );

  const receitaBruta = principalAbsoluto.find((l) => l.id === "receita_bruta")!;
  // Resultado Econômico fecha a própria DRE (nunca reduzido por Saídas Não
  // Operacionais) - por isso mora e ganha percentual em "principal", não em
  // "indicador" (onde só ficam Saídas e Geração de Caixa).
  const principal = comPercentuais(
    principalAbsoluto,
    ["deducoes", "cmv", "margem", "cmo", "custos_operacionais", "resultado_economico"],
    receitaBruta,
  );
  const indicador = comPercentuais(indicadorAbsoluto, ["saidas"], receitaBruta);

  const cmo = principalAbsoluto.find((l) => l.id === "cmo")!;
  const custosOperacionais = principalAbsoluto.find((l) => l.id === "custos_operacionais")!;
  const margem = principalAbsoluto.find((l) => l.id === "margem")!;
  const resultadoEconomico = principalAbsoluto.find((l) => l.id === "resultado_economico")!;

  const custosFixosTotal = somarOuNulo([cmo.total, custosOperacionais.total]);
  const percentualMargemTotal = dividirRazao(margem.total, receitaBruta.total);
  const pontoDeEquilibrio: number | "nao_calculavel" =
    percentualMargemTotal === null || percentualMargemTotal <= 0 || custosFixosTotal === null
      ? "nao_calculavel"
      : arredondar2(custosFixosTotal / percentualMargemTotal);

  return {
    ano,
    divisorMedia,
    principal,
    indicador,
    indicadores: {
      resultadoEconomico: resultadoEconomico.total,
      percentualResultadoEconomico: dividirRazao(resultadoEconomico.total, receitaBruta.total),
      pontoDeEquilibrio,
    },
  };
}
