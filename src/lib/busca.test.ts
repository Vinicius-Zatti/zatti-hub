import { describe, expect, it } from "vitest";
import { normalizarBusca } from "./busca";

describe("normalizarBusca", () => {
  it("ignora acento e maiúscula dos dois lados", () => {
    expect(normalizarBusca("Açúcar Cristal").includes(normalizarBusca(" acucar "))).toBe(true);
    expect(normalizarBusca("PÃO DE ALHO")).toBe("pao de alho");
    expect(normalizarBusca("limão")).toBe(normalizarBusca("LIMAO"));
  });
});
