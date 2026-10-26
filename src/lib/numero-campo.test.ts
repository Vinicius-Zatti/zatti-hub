import { describe, expect, it } from "vitest";
import { formatarNumeroCampo, interpretarNumeroDigitado } from "./numero-campo";

describe("interpretarNumeroDigitado", () => {
  it("aceita vírgula decimal e ponto de milhar", () => {
    expect(interpretarNumeroDigitado("3,50")).toBe(3.5);
    expect(interpretarNumeroDigitado("1.500,00")).toBe(1500);
    expect(interpretarNumeroDigitado("R$ 4.073,40")).toBe(4073.4);
    expect(interpretarNumeroDigitado("1.234.567,8")).toBe(1234567.8);
  });

  it("ponto sozinho seguido de 1 ou 2 dígitos é decimal, nunca milhar", () => {
    expect(interpretarNumeroDigitado("3.50")).toBe(3.5);
    expect(interpretarNumeroDigitado("0.5")).toBe(0.5);
  });

  it("ponto seguido de 3 dígitos continua milhar", () => {
    expect(interpretarNumeroDigitado("1.500")).toBe(1500);
  });

  it("vazio ou texto não numérico vira null", () => {
    expect(interpretarNumeroDigitado("")).toBeNull();
    expect(interpretarNumeroDigitado("  ")).toBeNull();
    expect(interpretarNumeroDigitado("abc")).toBeNull();
  });
});

describe("formatarNumeroCampo", () => {
  it("mostra vírgula decimal e casas fixas", () => {
    expect(formatarNumeroCampo(3.5, 2)).toBe("3,50");
    expect(formatarNumeroCampo(1300, 2)).toBe("1.300,00");
    expect(formatarNumeroCampo(0.9, 3)).toBe("0,900");
    expect(formatarNumeroCampo(null, 2)).toBe("");
  });
});
