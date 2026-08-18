import { describe, expect, it } from "vitest";
import { arredondarPreco, toNumeroBR } from "./numero";

describe("arredondarPreco", () => {
  it("valor exato em centavos não muda - nunca sobe sozinho pro centavo seguinte", () => {
    // Achado real em produção: 438,00 (e 75,00 x 1) virava 438,01/75,01 por
    // causa do arredondamento de ponto flutuante empurrando o valor uma
    // fração acima do inteiro (ex: 43800.000000000006).
    expect(arredondarPreco(438)).toBe(438);
    expect(arredondarPreco(75 * 1)).toBe(75);
    expect(arredondarPreco(4.2 * 5)).toBe(21); // 4.2*5 = 21.000000000000004 em float
    expect(arredondarPreco(5.49 * 6)).toBe(32.94);
  });

  it("milésimo 1 a 4 arredonda pra baixo (regra fechada com o Vinícius, 18/08)", () => {
    expect(arredondarPreco(74.001)).toBe(74);
    expect(arredondarPreco(74.004)).toBe(74);
  });

  it("milésimo 5 a 9 arredonda pra cima", () => {
    expect(arredondarPreco(74.005)).toBe(74.01);
    expect(arredondarPreco(74.009)).toBe(74.01);
  });

  it("não muda valor que já está exato em 2 casas", () => {
    expect(arredondarPreco(12.5)).toBe(12.5);
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
