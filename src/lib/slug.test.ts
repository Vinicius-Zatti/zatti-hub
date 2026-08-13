import { describe, expect, it } from "vitest";
import { gerarSlug } from "./slug";

describe("gerarSlug", () => {
  it("remove acentos e espaços, vira minúsculo com hífen", () => {
    expect(gerarSlug("Dona Ninguém")).toBe("dona-ninguem");
  });

  it("remove pontuação e colapsa hífens repetidos", () => {
    expect(gerarSlug("  Açaí & Cia!!  ")).toBe("acai-cia");
  });

  it("mantém números", () => {
    expect(gerarSlug("Loja 2 - Centro")).toBe("loja-2-centro");
  });
});
