import { describe, expect, it } from "vitest";
import { dividirEmVencimentos, paraCentavos, ratearDocumento } from "./rateio";

function conferir(linhas: number[], vencimentos: number[]) {
  const matriz = ratearDocumento(linhas, vencimentos);
  matriz.forEach((linha, i) => expect(linha.reduce((a, b) => a + b, 0)).toBe(linhas[i]));
  vencimentos.forEach((v, j) => expect(matriz.reduce((a, linha) => a + linha[j], 0)).toBe(v));
  for (const linha of matriz) for (const c of linha) expect(c).toBeGreaterThanOrEqual(0);
  return matriz;
}

describe("ratearDocumento", () => {
  it("nota de mercadoria, embalagem e limpeza em 3 vencimentos fecha nas duas direções", () => {
    conferir([30000, 10001, 4999], [15000, 15000, 15000]);
  });

  it("um vencimento só devolve as linhas inteiras", () => {
    expect(conferir([1234, 5678], [6912])).toEqual([[1234], [5678]]);
  });

  it("uma linha só devolve os vencimentos", () => {
    expect(conferir([1000], [333, 333, 334])).toEqual([[333, 333, 334]]);
  });

  it("linha minúscula com muitos vencimentos não fica negativa", () => {
    const m = conferir([1, 2, 99997], [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]);
    expect(m[0].filter((c) => c > 0).length).toBe(1);
  });

  it("casos aleatórios sempre fecham ao centavo", () => {
    let semente = 42;
    const aleatorio = (max: number) => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return 1 + (semente % max);
    };
    for (let k = 0; k < 300; k++) {
      const linhas = Array.from({ length: aleatorio(8) }, () => aleatorio(500000));
      const total = linhas.reduce((a, b) => a + b, 0);
      const n = Math.min(aleatorio(24), total);
      conferir(linhas, dividirEmVencimentos(total, n));
    }
  });

  it("recusa somas diferentes e centavos quebrados", () => {
    expect(() => ratearDocumento([100], [99])).toThrow();
    expect(() => ratearDocumento([10.5], [10.5])).toThrow();
    expect(() => ratearDocumento([0, 100], [100])).toThrow();
  });
});

describe("dividirEmVencimentos e paraCentavos", () => {
  it("sobra de centavo vai para os primeiros", () => {
    expect(dividirEmVencimentos(1000, 3)).toEqual([334, 333, 333]);
  });
  it("converte reais em centavos sem erro de ponto flutuante", () => {
    expect(paraCentavos(400.01)).toBe(40001);
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });
});
