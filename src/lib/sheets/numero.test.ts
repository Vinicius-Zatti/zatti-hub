import { describe, expect, it } from "vitest";
import { arredondarPrecoCima, toNumeroBR } from "./numero";

describe("arredondarPrecoCima", () => {
  it("repete o mesmo valor quando o resultado já é redondo em centavos (razão 1:1)", () => {
    // Achado real: 75,00 × 1 virava 75,01 por causa do arredondamento de
    // ponto flutuante empurrando 7500.000000000001 pro centavo seguinte.
    expect(arredondarPrecoCima(75 * 1)).toBe(75);
    expect(arredondarPrecoCima(4.2 * 5)).toBe(21); // 4.2*5 = 21.000000000000004 em float
  });

  it("continua arredondando pra cima quando sobra fração de centavo de verdade", () => {
    expect(arredondarPrecoCima(74.001)).toBe(74.01);
    expect(arredondarPrecoCima(10 / 3)).toBe(3.34);
  });

  it("não muda valor que já está exato em 2 casas", () => {
    expect(arredondarPrecoCima(12.5)).toBe(12.5);
  });
});

describe("toNumeroBR", () => {
  it("converte moeda pt-BR com milhar sem perder valores >= 1000", () => {
    expect(toNumeroBR("R$ 4.073,40")).toBe(4073.4);
  });

  it("retorna null pra vazio/indefinido", () => {
    expect(toNumeroBR("")).toBeNull();
    expect(toNumeroBR(undefined)).toBeNull();
  });
});
