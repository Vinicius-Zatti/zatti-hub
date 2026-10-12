/** Rateio de documento em centavos inteiros (Financeiro V2, 11/10/2026).
 *
 * Uma nota com várias linhas de Plano de Contas (ex.: mercadoria, embalagem, limpeza) e vários
 * vencimentos vira uma matriz linha x vencimento. A matriz fecha ao centavo nas duas direções:
 * cada linha soma o próprio valor e cada vencimento soma o valor do vencimento (exigência do
 * Codex; a RPC `fin_documento_criar` confere de novo). O arredondamento parte do valor ideal
 * proporcional, arredonda para baixo e distribui os centavos que faltam pelas células de maior
 * resto, respeitando o que falta em cada linha e em cada vencimento (problema de transporte com
 * células 0/1, resolvido por caminho de aumento). Sempre existe solução: a matriz proporcional
 * fracionária é viável e o politopo de transporte tem vértices inteiros. */

export type MatrizRateio = number[][];

function exigirCentavos(valores: number[], nome: string): void {
  for (const v of valores) {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`${nome} precisa ser centavo inteiro positivo`);
  }
}

export function ratearDocumento(linhas: number[], vencimentos: number[]): MatrizRateio {
  exigirCentavos(linhas, "Linha");
  exigirCentavos(vencimentos, "Vencimento");
  const total = linhas.reduce((a, b) => a + b, 0);
  if (total !== vencimentos.reduce((a, b) => a + b, 0)) {
    throw new Error("A soma das linhas precisa ser igual à soma dos vencimentos");
  }

  const m = linhas.length;
  const n = vencimentos.length;
  const base: number[][] = [];
  const resto: number[][] = [];
  for (let i = 0; i < m; i++) {
    base.push([]);
    resto.push([]);
    for (let j = 0; j < n; j++) {
      // Inteiros: linhas[i] * vencimentos[j] cabe com folga em Number para valores de restaurante.
      const produto = BigInt(linhas[i]) * BigInt(vencimentos[j]);
      base[i].push(Number(produto / BigInt(total)));
      resto[i].push(Number(produto % BigInt(total)));
    }
  }

  const faltaLinha = linhas.map((l, i) => l - base[i].reduce((a, b) => a + b, 0));
  const faltaCol = vencimentos.map((v, j) => v - base.reduce((a, linha) => a + linha[j], 0));
  const extra: number[][] = base.map((linha) => linha.map(() => 0));

  // Guloso pelo maior resto (desempate estável por posição).
  const celulas: [number, number][] = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (resto[i][j] > 0) celulas.push([i, j]);
  celulas.sort((a, b) => resto[b[0]][b[1]] - resto[a[0]][a[1]] || a[0] - b[0] || a[1] - b[1]);
  for (const [i, j] of celulas) {
    if (faltaLinha[i] > 0 && faltaCol[j] > 0) {
      extra[i][j] = 1;
      faltaLinha[i]--;
      faltaCol[j]--;
    }
  }

  // Sobrou centavo: caminho de aumento (linha com falta -> ... -> vencimento com falta),
  // trocando células com resto entre "recebe 1" e "não recebe".
  while (faltaLinha.some((f) => f > 0)) {
    const origem = faltaLinha.findIndex((f) => f > 0);
    const veioDeCol: (number | null)[] = Array(n).fill(null);
    const veioDeLinha: (number | null)[] = Array(m).fill(null);
    const visitadaLinha = Array(m).fill(false);
    visitadaLinha[origem] = true;
    const fila = [origem];
    let destino = -1;
    while (fila.length > 0 && destino < 0) {
      const i = fila.shift() as number;
      for (let j = 0; j < n; j++) {
        if (resto[i][j] === 0 || extra[i][j] === 1 || veioDeCol[j] !== null) continue;
        veioDeCol[j] = i;
        if (faltaCol[j] > 0) {
          destino = j;
          break;
        }
        for (let k = 0; k < m; k++) {
          if (!visitadaLinha[k] && extra[k][j] === 1) {
            visitadaLinha[k] = true;
            veioDeLinha[k] = j;
            fila.push(k);
          }
        }
      }
    }
    if (destino < 0) throw new Error("Rateio sem solução inteira (não deveria acontecer)");
    let j = destino;
    for (;;) {
      const i = veioDeCol[j] as number;
      extra[i][j] = 1;
      if (i === origem) break;
      const jAnterior = veioDeLinha[i] as number;
      extra[i][jAnterior] = 0;
      j = jAnterior;
    }
    faltaLinha[origem]--;
    faltaCol[destino]--;
  }

  return base.map((linha, i) => linha.map((v, j) => v + extra[i][j]));
}

/** Divide um total em N vencimentos iguais em centavos; os centavos que sobram vão para os
 * primeiros (mesma regra das parcelas manuais). */
export function dividirEmVencimentos(totalCentavos: number, quantidade: number): number[] {
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) throw new Error("Total inválido");
  if (!Number.isInteger(quantidade) || quantidade < 1) throw new Error("Quantidade inválida");
  const base = Math.floor(totalCentavos / quantidade);
  const sobra = totalCentavos - base * quantidade;
  return Array.from({ length: quantidade }, (_, i) => base + (i < sobra ? 1 : 0));
}

export function paraCentavos(valor: number): number {
  return Math.round(valor * 100);
}
