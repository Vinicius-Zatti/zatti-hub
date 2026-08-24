import { somarMesesClampado } from "./datas";
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

/** Divide o valor total em N parcelas mensais a partir da data da primeira -
 * resto de arredondamento (centavo perdido/sobrando ao dividir por N) sempre
 * vai pra última parcela, nunca distribuído no meio, pra soma bater com o
 * valor total em centavos (mesmo cuidado de `calcularTotais` em
 * consolidado-vendas.ts). Vencimento de cada parcela usa `somarMesesClampado`
 * a partir da primeira data, nunca a partir da parcela anterior (ver teste
 * "volta pro dia 31" em datas.test.ts). */
export function gerarParcelas(
  valorTotal: number,
  quantidadeParcelas: number,
  dataPrimeiraParcela: string,
): ParcelaGerada[] {
  if (quantidadeParcelas < 1) throw new Error("quantidadeParcelas deve ser no mínimo 1");

  const totalCents = paraCentavos(valorTotal);
  const baseCents = Math.floor(totalCents / quantidadeParcelas);
  const restoCents = totalCents - baseCents * quantidadeParcelas;

  return Array.from({ length: quantidadeParcelas }, (_, indice) => {
    const ehUltima = indice === quantidadeParcelas - 1;
    const valorCents = ehUltima ? baseCents + restoCents : baseCents;
    return {
      numero: indice + 1,
      totalParcelas: quantidadeParcelas,
      valor: valorCents / 100,
      dataPrevista: indice === 0 ? dataPrimeiraParcela : somarMesesClampado(dataPrimeiraParcela, indice),
    };
  });
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
