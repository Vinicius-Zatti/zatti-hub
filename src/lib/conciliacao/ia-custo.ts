// Tabela de preços da IA usada na Conciliação, em US$ por milhão de tokens.
// Fonte: tabela oficial da Anthropic (Claude Haiku 4.5: US$ 1 entrada,
// US$ 5 saída; escrita de cache 1,25x e leitura 0,1x a entrada). Mudou o
// preço, sobe a versão: o custo gravado em cada chamada guarda qual tabela
// foi usada. O valor é estimativa pelo uso informado na resposta; a fatura
// oficial fica no console da Anthropic.

export const MODELO_IA_CONCILIACAO = "claude-haiku-4-5";
export const VERSAO_TABELA_PRECOS = "2026-09-25";

type Preco = { entrada: number; saida: number; cacheEscrita: number; cacheLeitura: number };

const PRECOS: Record<string, Preco> = {
  "claude-haiku-4-5": { entrada: 1, saida: 5, cacheEscrita: 1.25, cacheLeitura: 0.1 },
};

export type UsoTokens = {
  entrada: number;
  saida: number;
  cacheEscrita: number;
  cacheLeitura: number;
};

/** Custo estimado em US$, arredondado a 6 casas (numeric(12,6) no banco). */
export function custoEstimadoUsd(modelo: string, uso: UsoTokens): number {
  const preco = PRECOS[modelo];
  if (!preco) throw new Error("modelo_sem_preco");
  const bruto =
    (uso.entrada * preco.entrada + uso.saida * preco.saida + uso.cacheEscrita * preco.cacheEscrita + uso.cacheLeitura * preco.cacheLeitura) /
    1_000_000;
  return Math.round(bruto * 1_000_000) / 1_000_000;
}

export const EXPLICACAO_CUSTO_IA =
  "Custo estimado = (tokens de entrada x US$ 1 + tokens de saída x US$ 5) / 1.000.000, pela tabela do Claude Haiku 4.5. Chamadas sem uso conhecido (erro de rede ou tempo esgotado) aparecem à parte e não entram na soma.";
