import type { StatusParcela } from "./tipos";

function paraCentavos(v: number): number {
  return Math.round(v * 100);
}

export type ParcelaGerada = {
  numero: number;
  totalParcelas: number;
  valor: number;
  dataPrevista: string;
};

/** Numera as linhas manuais do formulário ("Vencimento e Valor", 1 linha =
 * à vista, 2+ = parcelado) - cada uma já chega com valor e data próprios,
 * aqui só atribui número/total. Substitui o antigo `gerarParcelas` (dividia
 * um valor total em N parcelas iguais) - não perguntamos mais "número de
 * parcelas" (item 6 da correção de 25/08). */
export function numerarParcelasManuais(
  linhas: { valor: number; dataPrevista: string }[],
): ParcelaGerada[] {
  return linhas.map((linha, indice) => ({
    numero: indice + 1,
    totalParcelas: linhas.length,
    valor: linha.valor,
    dataPrevista: linha.dataPrevista,
  }));
}

/** Espelha `status_por_saldo_parcela` do banco (migração
 * `20260824090000_financeiro_gerencial_fundamentos.sql`) - usada só pra
 * estimativa otimista de UI antes do `router.refresh()` trazer o valor real.
 * Quem decide de verdade é o gatilho `proteger_parcela_financeira`: um
 * UPDATE de `status` vindo do cliente é sempre ignorado. Comparação em
 * centavos pelo mesmo motivo de `calcularTotais`: 0.1 + 0.2 !== 0.3 em ponto
 * flutuante (o banco não tem esse problema - `numeric` é decimal exato). */
export function calcularStatusParcela(valorParcela: number, valorBaixado: number): StatusParcela {
  const parcelaCents = paraCentavos(valorParcela);
  const baixadoCents = paraCentavos(valorBaixado);
  if (baixadoCents <= 0) return "aberto";
  if (baixadoCents >= parcelaCents) return "quitado";
  return "parcial";
}

export function somarValores(valores: number[]): number {
  const totalCents = valores.reduce((acc, v) => acc + paraCentavos(v), 0);
  return totalCents / 100;
}

/** Quanto ainda falta baixar - nunca negativo (uma baixa que exceda o saldo
 * aberto é rejeitada antes de chegar aqui, ver `registrarBaixa` em
 * src/lib/banco/financeiro-gerencial.ts). */
export function calcularSaldoAberto(valorParcela: number, valorBaixado: number): number {
  const saldoCents = Math.max(0, paraCentavos(valorParcela) - paraCentavos(valorBaixado));
  return saldoCents / 100;
}
