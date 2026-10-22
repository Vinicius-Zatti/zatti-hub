import { describe, expect, it } from "vitest";
import { diferencaCaixa } from "./consolidado-diferenca";

describe("diferencaCaixa", () => {
  it("recebeu mais do que vendeu: sobra, com valor positivo", () => {
    expect(diferencaCaixa(1050, 1000)).toEqual({ valor: 50, sentido: "sobra" });
  });

  it("vendeu mais do que recebeu: falta, com valor negativo", () => {
    expect(diferencaCaixa(1000, 1233)).toEqual({ valor: -233, sentido: "falta" });
  });

  it("bateu: zero", () => {
    expect(diferencaCaixa(500, 500)).toEqual({ valor: 0, sentido: "zero" });
  });

  it("soma em centavos, sem erro de ponto flutuante", () => {
    expect(diferencaCaixa(0.1 + 0.2, 0.3)).toEqual({ valor: 0, sentido: "zero" });
    expect(diferencaCaixa(10.1, 10.11)).toEqual({ valor: -0.01, sentido: "falta" });
  });
});
