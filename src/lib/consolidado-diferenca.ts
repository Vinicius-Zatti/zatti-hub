/** Sentido da diferença do Consolidado de Vendas, só para exibir. Fica fora
 * de `consolidado-vendas.ts` porque aquele arquivo importa o Supabase do
 * servidor e isto roda também no navegador.
 *
 * Não muda a regra de cálculo: o valor gravado em `diferenca` continua sendo
 * o absoluto e o status continua vindo de `calcularTotais`. Aqui só se lê o
 * lado a partir dos dois totais que já ficam gravados:
 * recebido (formas de pagamento) - vendido (canais próprios).
 * Positivo = entrou mais do que foi vendido (sobra no caixa).
 * Negativo = foi vendido mais do que entrou (falta no caixa). */
export type SentidoDiferenca = "sobra" | "falta" | "zero";

export const EXPLICACAO_DIFERENCA_CAIXA =
  "Diferença = total das formas de pagamento (o que entrou) - total dos canais próprios, Salão + Delivery próprio (o que foi vendido). Positiva (+) é sobra no caixa: entrou mais do que foi vendido. Negativa (-) é falta no caixa: foi vendido mais do que entrou. iFood e 99Food ficam fora da conta.";

export function diferencaCaixa(
  totalFormasPagamento: number,
  totalCanais: number,
): { valor: number; sentido: SentidoDiferenca } {
  // Em centavos, igual a `calcularTotais`, para não errar no arredondamento.
  const centavos = Math.round(totalFormasPagamento * 100) - Math.round(totalCanais * 100);
  return {
    valor: centavos / 100,
    sentido: centavos > 0 ? "sobra" : centavos < 0 ? "falta" : "zero",
  };
}
