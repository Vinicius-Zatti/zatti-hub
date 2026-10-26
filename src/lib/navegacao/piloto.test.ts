import { describe, expect, it } from "vitest";
import { usaNavegacaoV2 } from "./piloto";

describe("Navegação V2 liberada para todos (26/10/2026)", () => {
  it("toda unidade de cliente vê o menu novo", () => {
    for (const unidadeId of ["zatti-burger", "zatti-teste", "dom-quixote", "the-house-food-fun"]) {
      expect(usaNavegacaoV2({ unidadeId, areaInterna: false })).toBe(true);
    }
  });

  it("área interna (Zatti HUB do Vinícius) segue com o menu antigo", () => {
    expect(usaNavegacaoV2({ unidadeId: "zatti-hub", areaInterna: true })).toBe(false);
  });
});
