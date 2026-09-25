import type { IndicadoresDre } from "./dre-anual";

/** Avisos da DRE para o cliente (pedido de Vinícius em 25/09): a DRE sempre
 * mostra número, e quando falta dado diz o que falta, em quais meses e o
 * efeito no resultado. Função pura - a tela só desenha. */

export const MESES_POR_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export type AvisoDre = { id: string; titulo: string; texto: string };

/** Meses do ano que já começaram (calendário), independente da visão. */
export function mesesJaIniciados(ano: number, hoje: Date = new Date()): number {
  const anoAtual = hoje.getFullYear();
  if (ano < anoAtual) return 12;
  if (ano > anoAtual) return 0;
  return hoje.getMonth() + 1;
}

function listarMeses(indices: number[], ano: number): string {
  const nomes = indices.map((i) => MESES_POR_EXTENSO[i]);
  const lista = nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `${lista} de ${ano}`;
}

/** Meses considerados = os marcados em Colunas que já começaram (mês futuro
 * não tem dado a cobrar). Sem mês marcado, vale o ano já transcorrido. */
export function mesesConsiderados(indicesMarcados: number[], mesesTranscorridos: number): number[] {
  const base = indicesMarcados.length > 0 ? indicesMarcados : Array.from({ length: 12 }, (_, i) => i);
  return base.filter((i) => i < mesesTranscorridos).sort((a, b) => a - b);
}

export function avisosDre(params: {
  ano: number;
  meses: number[];
  cmvProvisorio: boolean[];
  semReceitaVendasProdutos: boolean[];
  caminhoCadastro: string;
}): AvisoDre[] {
  const { ano, meses, cmvProvisorio, semReceitaVendasProdutos, caminhoCadastro } = params;
  const avisos: AvisoDre[] = [];

  // Aviso único (25/09): o que falta preencher, agrupado por mês, com o
  // efeito em uma frase e onde preencher.
  const grupos = new Map<string, number[]>();
  for (const i of meses) {
    const falta = [cmvProvisorio[i] ? "o estoque final" : null, semReceitaVendasProdutos[i] ? "a Venda de Produtos" : null].filter(Boolean).join(" e ");
    if (falta) grupos.set(falta, [...(grupos.get(falta) ?? []), i]);
  }
  if (grupos.size > 0) {
    const partes = Array.from(grupos.entries()).map(([falta, indices]) => `${falta} de ${listarMeses(indices, ano)}`);
    const faltaEstoque = meses.some((i) => cmvProvisorio[i]);
    const faltaVenda = meses.some((i) => semReceitaVendasProdutos[i]);
    const efeito = [
      faltaEstoque ? "sem o estoque final o CMV fica provisório (estoque inicial + CMC) e os resultados podem estar diferentes do real" : null,
      faltaVenda ? "sem a Venda de Produtos aparece o % CMC provisório no lugar do % CMV" : null,
    ].filter(Boolean);
    avisos.push({
      id: "falta_preencher",
      titulo: `Ainda falta colocar ${partes.join("; ")}`,
      texto: `${efeito.join(", e ").replace(/^./, (c) => c.toUpperCase())}. Preencha em ${caminhoCadastro}.`,
    });
  }

  return avisos;
}

/** Texto de apoio de cada quadro do topo: nunca um quadro vazio sem motivo. */
export function explicacaoIndicadores(indicadores: IndicadoresDre, meses: number[]): {
  resultadoEconomico: string | null;
  percentual: string | null;
  pontoDeEquilibrio: string | null;
} {
  if (meses.length === 0) {
    const motivo = "Os meses marcados ainda não começaram - sem lançamentos para calcular.";
    return { resultadoEconomico: motivo, percentual: motivo, pontoDeEquilibrio: motivo };
  }
  const semReceita = indicadores.percentualResultadoEconomico === null;
  return {
    resultadoEconomico: null,
    percentual: semReceita ? "Sem receita lançada no período: não há base para o percentual." : null,
    pontoDeEquilibrio:
      indicadores.pontoDeEquilibrio !== "sem_margem"
        ? null
        : semReceita
          ? "Sem receita lançada no período: não há margem para calcular o ponto de equilíbrio."
          : "Margem de contribuição zero ou negativa no período: as vendas não cobrem os custos variáveis, então não existe ponto de equilíbrio.",
  };
}
