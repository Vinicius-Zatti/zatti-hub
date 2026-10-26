import { describe, expect, it } from "vitest";
import {
  distanciaNomesPrePreparo,
  nomeComparavelPrePreparo,
  nomeContagemSugerido,
  precoDoCustoDaFicha,
  skuDaUniaoPrePreparo,
} from "./pre-preparo";

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

describe("nomes parecidos de pré-preparo (usar a ficha existente)", () => {
  it("ignora acento, caixa, pontuação e o 'da casa' do fim", () => {
    expect(nomeComparavelPrePreparo("Maionese de Limão Siciliano")).toBe("maionese de limao siciliano");
    expect(nomeComparavelPrePreparo("  cebola caramelizada da casa ")).toBe("cebola caramelizada");
    expect(nomeComparavelPrePreparo("Molho (especial)!")).toBe("molho especial");
  });

  it("acha os pares reais da Dom Quixote", () => {
    expect(distanciaNomesPrePreparo("Barbecue de Goiabada", "Barbecue de goiabada")).toBe(0);
    expect(distanciaNomesPrePreparo("Cebola Caramelizada", "Cebola caramelizada")).toBe(0);
    expect(distanciaNomesPrePreparo("Maionese de Limão Siciliano", "Maionese de limão siciliano")).toBe(0);
  });

  it("aceita diferença pequena e espaço a mais", () => {
    expect(distanciaNomesPrePreparo("Barbecue goiabada", "Barbecue de goiabada")).toBe(2);
    expect(distanciaNomesPrePreparo("Cole slaw", "Coleslaw")).toBe(0);
  });

  it("não junta nomes diferentes nem números diferentes", () => {
    expect(distanciaNomesPrePreparo("Maionese Verde", "Maionese da casa")).toBeNull();
    expect(distanciaNomesPrePreparo("Molho de queijo", "Molho de tomate")).toBeNull();
    expect(distanciaNomesPrePreparo("burger 180g da casa", "burger 160g")).toBeNull();
    expect(distanciaNomesPrePreparo("Molho 1", "Molho 2")).toBeNull();
    expect(distanciaNomesPrePreparo("", "Molho")).toBeNull();
  });
});

describe("skuDaUniaoPrePreparo (quem nasce primeiro manda)", () => {
  const produto = { sku: "PRECEBCAR", criadoEm: "2026-08-10T12:00:00+00:00" };

  it("produto mais antigo: a ficha recebe o SKU do produto", () => {
    expect(skuDaUniaoPrePreparo({ produto, ficha: { sku: "PRERECCCA", criadoEm: "2026-08-27T12:00:00+00:00" } })).toEqual({
      skuFinal: "PRECEBCAR",
      muda: "ficha",
    });
  });

  it("ficha mais antiga: o produto recebe o SKU da ficha", () => {
    expect(skuDaUniaoPrePreparo({ produto, ficha: { sku: "PRERECCCA", criadoEm: "2026-08-01T12:00:00+00:00" } })).toEqual({
      skuFinal: "PRERECCCA",
      muda: "produto",
    });
  });

  it("mesmo instante: fica o SKU do produto, como no banco", () => {
    expect(skuDaUniaoPrePreparo({ produto, ficha: { sku: "PRERECCCA", criadoEm: produto.criadoEm } }).muda).toBe("ficha");
  });
});
