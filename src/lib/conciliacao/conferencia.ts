import type { ConferenciaAritmetica, LinhaExtraida } from "./tipos";

// Conferência aritmética pelos saldos impressos no extrato: entre dois
// saldos consecutivos, saldo anterior + entradas - saídas = saldo seguinte,
// em centavos exatos. Movimento antes do primeiro saldo não tem base (o
// extrato não traz o saldo de abertura) e fica marcado sem conferência.
// Quando a mesma IA leu movimentos e saldos, isto é só consistência
// aritmética, não prova independente de que nada foi omitido.

export type ResultadoConferencia = {
  conferencia: ConferenciaAritmetica;
  linhas: LinhaExtraida[];
  diasDivergentes: string[];
};

export function conferirSaldos(linhas: LinhaExtraida[]): ResultadoConferencia {
  const saldos = linhas.filter((l) => l.tipo === "saldo");
  if (saldos.length < 2) {
    return { conferencia: "nao_verificavel", linhas: linhas.map((l) => (l.tipo === "movimento" ? { ...l, conferido: false } : l)), diasDivergentes: [] };
  }

  const conferidas = new Set<number>();
  const diasDivergentes: string[] = [];
  let anterior: number | null = null;
  let segmento: number[] = [];
  let soma = 0;
  let movimentosAntesDoPrimeiroSaldo = 0;
  let erroNoSegmento = false;

  for (const l of linhas) {
    if (l.tipo === "movimento") {
      segmento.push(l.posicao);
      soma += l.direcao === "entrada" ? l.valorCentavos : -l.valorCentavos;
    } else if (l.tipo === "erro") {
      erroNoSegmento = true;
    } else {
      if (anterior === null) {
        movimentosAntesDoPrimeiroSaldo = segmento.length;
      } else if (!erroNoSegmento && anterior + soma === l.saldoCentavos) {
        for (const p of segmento) conferidas.add(p);
      } else {
        diasDivergentes.push(l.data);
      }
      anterior = l.saldoCentavos;
      segmento = [];
      soma = 0;
      erroNoSegmento = false;
    }
  }
  // Movimentos depois do último saldo não têm conferência.
  const semFechamento = segmento.length;

  const conferencia: ConferenciaAritmetica =
    diasDivergentes.length > 0
      ? "divergente"
      : movimentosAntesDoPrimeiroSaldo > 0 || semFechamento > 0
        ? "conferida_exceto_inicio"
        : "conferida";

  return {
    conferencia,
    diasDivergentes,
    linhas: linhas.map((l) => (l.tipo === "movimento" ? { ...l, conferido: conferidas.has(l.posicao) } : l)),
  };
}
