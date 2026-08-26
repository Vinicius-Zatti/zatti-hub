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
  resultadoLiquido: number | null;
  percentualResultadoLiquido: number | null;
  pontoDeEquilibrio: number | "nao_calculavel";
};

export type DreAnual = {
  ano: number;
  divisorMedia: number | null;
  linhas: LinhaDreAnual[];
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
  resultado_economico: "% Resultado Econômico",
  saidas: "% Saídas Não Operacionais",
  resultado_liquido: "% Resultado Líquido",
};

/** Linha de percentual frente a um denominador - Total e Média são a divisão
 * dos Totais/Médias já agregados, nunca a média das 12 razões mensais (regra
 * explícita: "Total da linha ÷ Total do denominador", "Média da linha ÷
 * Média do denominador"). Mês sem denominador mostra "-", nunca 0/0. Todo
 * percentual usa a Receita Operacional Bruta como denominador, EXCETO % CMV,
 * que usa a Receita de Vendas de Produtos (regra explícita: "Nunca usar
 * Receita Operacional Bruta como denominador do % CMV") - por isso a função
 * recebe o denominador explícito em vez de sempre a Receita Bruta. */
function linhaPercentual(linha: LinhaDreAnual, denominador: LinhaDreAnual): LinhaDreAnual {
  return {
    id: `${linha.id}_percentual`,
    rotulo: ROTULOS_PERCENTUAL[linha.id] ?? `% ${linha.rotulo}`,
    nivel: linha.nivel,
    percentual: true,
    valoresPorMes: linha.valoresPorMes.map((v, indice) => dividirRazao(v, denominador.valoresPorMes[indice])),
    total: dividirRazao(linha.total, denominador.total),
    media: dividirRazao(linha.media, denominador.media),
  };
}

function comPercentuais(linhas: LinhaDreAnual[], denominadorPorId: Record<string, LinhaDreAnual>): LinhaDreAnual[] {
  return linhas.flatMap((linha) => {
    const denominador = denominadorPorId[linha.id];
    return denominador ? [linha, linhaPercentual(linha, denominador)] : [linha];
  });
}

/** Linha auxiliar (não aparece em `linhas`) só pra servir de denominador do
 * % CMV - Receita de Vendas de Produtos nunca soma na Receita Operacional
 * Bruta nem entra no CMV em R$, é puramente o "por quanto dividir" do % CMV.
 * Mês futuro mostra "-" (mesma máscara de `mesesValidos` do resto da DRE);
 * mês já transcorrido sem valor preenchido entra como 0 no Total (nunca
 * invalida o ano inteiro - diferente da regra de estoque pendente do CMV em
 * R$, que é sobre integridade de cálculo, não sobre este denominador). */
function montarLinhaReceitaVendasProdutos(valoresPorMesBrutos: number[], mesesValidos: number, divisorMedia: number | null): LinhaDreAnual {
  const valoresPorMes = valoresPorMesBrutos.map((v, indice) => (indice < mesesValidos ? v : null));
  const total = mesesValidos === 0 ? null : somarValores(valoresPorMesBrutos.slice(0, mesesValidos));
  const media = dividirMonetario(total, divisorMedia);
  return { id: "receita_vendas_produtos", rotulo: "Receita de Vendas de Produtos", nivel: 0, valoresPorMes, total, media };
}

/** Monta a DRE anual a partir de 12 `Dre` já calculados (índice 0 = janeiro
 * ... 11 = dezembro, todos pelo motor `calcularDre` sem nenhuma alteração de
 * fórmula) - função de apresentação/análise pura, agrega o que o motor já
 * calculou mês a mês. `receitaVendasProdutosPorMes` (índice 0 = janeiro ...
 * 11 = dezembro, valor bruto de `fin_estoque_mensal.receita_vendas_produtos`,
 * 0 quando o mês não tem linha) é o dado complementar manual usado só como
 * denominador do % CMV. */
export function montarDreAnual(dresPorMes: Dre[], ano: number, receitaVendasProdutosPorMes: number[], hoje: Date = new Date()): DreAnual {
  const divisorMedia = calcularDivisorMedia(ano, hoje);
  const mesesValidos = divisorMedia ?? 0;
  const arvoresMensais = dresPorMes.map((dre) => montarArvoreMensal(dre));

  const absoluto = combinarArvore(arvoresMensais, mesesValidos, divisorMedia);
  const receitaVendasProdutos = montarLinhaReceitaVendasProdutos(receitaVendasProdutosPorMes, mesesValidos, divisorMedia);

  const receitaBruta = absoluto.find((l) => l.id === "receita_bruta")!;
  const linhas = comPercentuais(absoluto, {
    deducoes: receitaBruta,
    cmv: receitaVendasProdutos,
    margem: receitaBruta,
    cmo: receitaBruta,
    custos_operacionais: receitaBruta,
    resultado_economico: receitaBruta,
    saidas: receitaBruta,
    resultado_liquido: receitaBruta,
  });

  const cmo = absoluto.find((l) => l.id === "cmo")!;
  const custosOperacionais = absoluto.find((l) => l.id === "custos_operacionais")!;
  const margem = absoluto.find((l) => l.id === "margem")!;
  const resultadoLiquido = absoluto.find((l) => l.id === "resultado_liquido")!;

  const custosFixosTotal = somarOuNulo([cmo.total, custosOperacionais.total]);
  const percentualMargemTotal = dividirRazao(margem.total, receitaBruta.total);
  const pontoDeEquilibrio: number | "nao_calculavel" =
    percentualMargemTotal === null || percentualMargemTotal <= 0 || custosFixosTotal === null
      ? "nao_calculavel"
      : arredondar2(custosFixosTotal / percentualMargemTotal);

  return {
    ano,
    divisorMedia,
    linhas,
    indicadores: {
      resultadoLiquido: resultadoLiquido.total,
      percentualResultadoLiquido: dividirRazao(resultadoLiquido.total, receitaBruta.total),
      pontoDeEquilibrio,
    },
  };
}
