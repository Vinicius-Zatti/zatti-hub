import { describe, expect, it } from "vitest";
import { nomeContagemSugerido, precoDoCustoDaFicha } from "./pre-preparo";

describe("precoDoCustoDaFicha", () => {
  it("usa o custo por unidade de rendimento, em centavos", () => {
    expect(precoDoCustoDaFicha({ custoTotal: 25, custoPorUnidade: 25 / 3, completo: true })).toBe(8.33);
  });

  it("mantém o preço manual enquanto falta preço de ingrediente", () => {
    expect(precoDoCustoDaFicha({ custoTotal: 10, custoPorUnidade: 10, completo: false })).toBeNull();
  });

  it("mantém o preço manual sem custo por unidade (ficha sem ingrediente ou rendimento zero)", () => {
    expect(precoDoCustoDaFicha({ custoTotal: null, custoPorUnidade: null, completo: false })).toBeNull();
    expect(precoDoCustoDaFicha({ custoTotal: 10, custoPorUnidade: null, completo: true })).toBeNull();
  });
});

describe("nomeContagemSugerido", () => {
  it("põe em caixa baixa e acrescenta 'da casa'", () => {
    expect(nomeContagemSugerido("Molho de Tomate Caseiro")).toBe("molho de tomate caseiro da casa");
  });

  it("não repete 'da casa'", () => {
    expect(nomeContagemSugerido("Maionese da casa")).toBe("maionese da casa");
  });

  it("preserva medida e sigla", () => {
    expect(nomeContagemSugerido("Calda 2L CO2")).toBe("calda 2L CO2 da casa");
  });
});
