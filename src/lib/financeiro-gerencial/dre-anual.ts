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
  /** "sem_margem" quando a margem de contribuição do período é zero ou
   * negativa (ou não há receita pra calcular o percentual). */
  pontoDeEquilibrio: number | "sem_margem";
};

/** Indicadores do topo da DRE sobre os meses marcados em Colunas (pedido de
 * 25/09): um mês = aquele mês, vários = a soma deles. Percentual e Ponto de
 * Equilíbrio sempre sobre essa soma, nunca média de razões. Ponto de
 * Equilíbrio = custos fixos (CMO + Custos Operacionais) / % margem de
 * contribuição. Mês futuro (valor null) nunca entra na soma. Sem nenhum mês
 * informado, vale o ano inteiro já transcorrido. */
export function calcularIndicadoresPeriodo(linhas: LinhaDreAnual[], indicesMeses: number[]): IndicadoresDre {
  const indices = indicesMeses.length > 0 ? indicesMeses : Array.from({ length: 12 }, (_, i) => i);
  const soma = (id: string): number | null => {
    const linha = linhas.find((l) => l.id === id);
    if (!linha) return null;
    const valores = indices.map((i) => linha.valoresPorMes[i]).filter((v): v is number => v !== null && v !== undefined);
    return valores.length === 0 ? null : somarValores(valores);
  };
  const receita = soma("receita_bruta");
  const resultadoEconomico = soma("resultado_economico");
  const margem = soma("margem");
  const custosFixos = soma("custos_fixos") ?? 0;
  const percentualMargem = dividirRazao(margem, receita);
  return {
    resultadoEconomico,
    percentualResultadoEconomico: dividirRazao(resultadoEconomico, receita),
    pontoDeEquilibrio: percentualMargem === null || percentualMargem <= 0 ? "sem_margem" : arredondar2(custosFixos / percentualMargem),
  };
}

export type DreAnual = {
  ano: number;
  divisorMedia: number | null;
  /** Índice (0-12) do primeiro mês ainda não começado: dele em diante os
   * valores são previsão (estilo atenuado na tela). 12 = nenhum. */
  primeiroMesPrevisto: number;
  /** Mês (0-11) sem inventário cadastrado - CMV calculado só com as compras. */
  /** Mês (0-11) com CMV provisório (estoque final ainda não informado). */
  cmvProvisorioPorMes: boolean[];
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

// Nomes dos percentuais da Planilha Financeiro da Zatti (V1, 25/09).
const ROTULOS_PERCENTUAL: Record<string, string> = {
  margem: "% Margem de Contribuição",
  custos_fixos: "% Custos Fixos",
  cmo: "% Custo com Mão de Obra (CMO)",
  custos_operacionais: "% Custos Operacionais",
  resultado_liquido: "% Resultado Líquido do Exercício",
  saidas: "% Saídas não Operacionais",
  resultado_economico: "% Resultado Econômico",
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

/** Percentual logo abaixo do CMV (regra final de 25/09), mês a mês:
 * - "% CMV" = CMV / Venda de Produtos, só com o CMV fechado (estoque final
 *   informado) E a Venda de Produtos preenchida;
 * - senão "% CMC" provisório = CMC / (Receita Operacional Bruta - receitas
 *   de entrega), porque entrega não é venda de produto.
 * Nunca CMV sobre Receita Bruta. Total/Média só quando todos os meses
 * considerados estão no mesmo estado; misturado fica "-". O rótulo diz qual
 * dos dois está na tela. */
function comPercentualCmv(
  linhas: LinhaDreAnual[],
  absoluto: LinhaDreAnual[],
  provisorioPorMes: boolean[],
  vendaProdutos: LinhaDreAnual,
  receitaBruta: LinhaDreAnual,
  mesesValidos: number,
): LinhaDreAnual[] {
  const cmv = absoluto.find((l) => l.id === "cmv");
  const cmc = absoluto.find((l) => l.id === "cmc");
  if (!cmv || !cmc) return linhas;

  const usaCmv = (i: number) => !provisorioPorMes[i] && (vendaProdutos.valoresPorMes[i] ?? 0) > 0;
  const valoresPorMes = cmv.valoresPorMes.map((_, i) =>
    usaCmv(i) ? dividirRazao(cmv.valoresPorMes[i], vendaProdutos.valoresPorMes[i]) : dividirRazao(cmc.valoresPorMes[i], receitaBruta.valoresPorMes[i]),
  );
  const considerados = Array.from({ length: mesesValidos }, (_, i) => i);
  const todosCmv = considerados.length > 0 && considerados.every(usaCmv);
  const nenhumCmv = considerados.every((i) => !usaCmv(i));
  const total = todosCmv ? dividirRazao(cmv.total, vendaProdutos.total) : nenhumCmv ? dividirRazao(cmc.total, receitaBruta.total) : null;
  const media = todosCmv ? dividirRazao(cmv.media, vendaProdutos.media) : nenhumCmv ? dividirRazao(cmc.media, receitaBruta.media) : null;
  const rotulo = todosCmv ? "% CMV" : nenhumCmv ? "% CMC (provisório)" : "% CMV / % CMC (provisório nos meses sem fechamento)";

  const linhaPercentualCmv: LinhaDreAnual = { id: "cmv_percentual", rotulo, nivel: 0, percentual: true, valoresPorMes, total, media };
  return linhas.flatMap((l) => (l.id === "cmv" ? [l, linhaPercentualCmv] : [l]));
}

/** Linha auxiliar (não aparece em `linhas`) só pra servir de denominador do
 * % CMV - Receita de Vendas de Produtos nunca soma na Receita Operacional
 * Bruta nem entra no CMV em R$, é puramente o "por quanto dividir" do % CMV.
 * Mês futuro mostra "-" (mesma máscara de `mesesValidos` do resto da DRE);
 * mês já transcorrido sem valor preenchido entra como 0 no Total (nunca
 * invalida o ano inteiro - diferente da regra de estoque pendente do CMV em
 * R$, que é sobre integridade de cálculo, não sobre este denominador). */
function montarLinhaAuxiliar(id: string, rotulo: string, valoresPorMesBrutos: number[], mesesValidos: number, divisorMedia: number | null): LinhaDreAnual {
  const valoresPorMes = valoresPorMesBrutos.map((v, indice) => (indice < mesesValidos ? v : null));
  const total = mesesValidos === 0 ? null : somarValores(valoresPorMesBrutos.slice(0, mesesValidos));
  const media = dividirMonetario(total, divisorMedia);
  return { id, rotulo, nivel: 0, valoresPorMes, total, media };
}

function montarLinhaReceitaVendasProdutos(valoresPorMesBrutos: number[], mesesValidos: number, divisorMedia: number | null): LinhaDreAnual {
  return montarLinhaAuxiliar("receita_vendas_produtos", "Venda de Produtos", valoresPorMesBrutos, mesesValidos, divisorMedia);
}

/** Monta a DRE anual a partir de 12 `Dre` já calculados (índice 0 = janeiro
 * ... 11 = dezembro, todos pelo motor `calcularDre` sem nenhuma alteração de
 * fórmula) - função de apresentação/análise pura, agrega o que o motor já
 * calculou mês a mês. `receitaVendasProdutosPorMes` (índice 0 = janeiro ...
 * 11 = dezembro, valor bruto de `fin_estoque_mensal.receita_vendas_produtos`,
 * 0 quando o mês não tem linha) é o dado complementar manual usado só como
 * denominador do % CMV. */
export function montarDreAnual(
  dresPorMes: Dre[],
  ano: number,
  receitaVendasProdutosPorMes: number[],
  hoje: Date = new Date(),
  opcoes: { incluirMesesFuturos?: boolean } = {},
): DreAnual {
  // Projetada/Completa (25/09) mostram o ano inteiro, inclusive meses que
  // ainda não começaram (é justamente onde está o previsto): Total soma os
  // 12 meses e a Média divide por 12. Realizada segue a regra antiga.
  const divisorMedia = opcoes.incluirMesesFuturos ? 12 : calcularDivisorMedia(ano, hoje);
  const mesesValidos = divisorMedia ?? 0;
  const arvoresMensais = dresPorMes.map((dre) => montarArvoreMensal(dre));

  const absoluto = combinarArvore(arvoresMensais, mesesValidos, divisorMedia);
  const receitaVendasProdutos = montarLinhaReceitaVendasProdutos(receitaVendasProdutosPorMes, mesesValidos, divisorMedia);

  const receitaBruta = absoluto.find((l) => l.id === "receita_bruta")!;
  const cmvProvisorioPorMes = dresPorMes.map((dre) => dre.cmv.provisorio);
  const linhas = comPercentuais(absoluto, {
    margem: receitaBruta,
    custos_fixos: receitaBruta,
    cmo: receitaBruta,
    custos_operacionais: receitaBruta,
    resultado_liquido: receitaBruta,
    saidas: receitaBruta,
    resultado_economico: receitaBruta,
  });

  const receitaSemEntregas = montarLinhaAuxiliar(
    "receita_sem_entregas",
    "Receita Operacional Bruta sem entregas",
    dresPorMes.map((dre) => somarValores([dre.receitas.total, -dre.receitaEntregas])),
    mesesValidos,
    divisorMedia,
  );
  const linhasComPercentualCmv = comPercentualCmv(linhas, absoluto, cmvProvisorioPorMes, receitaVendasProdutos, receitaSemEntregas, mesesValidos);

  return {
    ano,
    divisorMedia,
    cmvProvisorioPorMes,
    primeiroMesPrevisto: calcularDivisorMedia(ano, hoje) ?? 0,
    linhas: linhasComPercentualCmv,
    indicadores: calcularIndicadoresPeriodo(absoluto, Array.from({ length: mesesValidos }, (_, i) => i)),
  };
}
