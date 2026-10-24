import { describe, expect, it } from "vitest";
import { UNIDADES_PILOTO_NAVEGACAO, usaNavegacaoV2 } from "./piloto";

describe("piloto da Navegação V2", () => {
  it("a lista começa só com o Zatti Burger", () => {
    expect(UNIDADES_PILOTO_NAVEGACAO).toEqual(["zatti-burger"]);
  });

  it("unidade piloto vê o menu novo", () => {
    expect(usaNavegacaoV2({ unidadeId: "zatti-burger", areaInterna: false })).toBe(true);
  });

  it("unidade fora do piloto segue com o menu atual", () => {
    for (const unidadeId of ["zatti-teste", "dom-quixote", "zatti-burger-2", "ZATTI-BURGER", ""]) {
      expect(usaNavegacaoV2({ unidadeId, areaInterna: false })).toBe(false);
    }
  });

  it("área interna (Zatti HUB do Vinícius) nunca entra no piloto", () => {
    expect(usaNavegacaoV2({ unidadeId: "zatti-burger", areaInterna: true })).toBe(false);
    expect(usaNavegacaoV2({ unidadeId: "zatti-hub", areaInterna: true })).toBe(false);
  });
});
