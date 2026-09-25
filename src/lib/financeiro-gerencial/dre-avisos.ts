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
  semInventario: boolean[];
  semReceitaVendasProdutos: boolean[];
  caminhoCadastro: string;
}): AvisoDre[] {
  const { ano, meses, semInventario, semReceitaVendasProdutos, caminhoCadastro } = params;
  const avisos: AvisoDre[] = [];

  const mesesSemInventario = meses.filter((i) => semInventario[i]);
  if (mesesSemInventario.length > 0) {
    const plural = mesesSemInventario.length > 1;
    avisos.push({
      id: "sem_inventario",
      titulo: `Inventário de ${listarMeses(mesesSemInventario, ano)} não cadastrado`,
      texto:
        `O CMV ${plural ? "desses meses" : "do mês"} está considerando só as compras, então a margem de contribuição, os resultados ` +
        `e o ponto de equilíbrio podem estar diferentes do real. Cadastre o inventário em ${caminhoCadastro} para corrigir.`,
    });
  }

  const mesesSemReceitaProdutos = meses.filter((i) => semReceitaVendasProdutos[i]);
  if (mesesSemReceitaProdutos.length > 0) {
    avisos.push({
      id: "sem_receita_vendas_produtos",
      titulo: `Receita de Vendas de Produtos de ${listarMeses(mesesSemReceitaProdutos, ano)} não informada`,
      texto: `Sem ela o % CMV não pode ser calculado e aparece como "-". Os valores em R$ não mudam. Informe em ${caminhoCadastro}.`,
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
