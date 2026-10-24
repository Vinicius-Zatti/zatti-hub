import { describe, expect, it } from "vitest";
import { destinoSeguro, tipoAceito } from "./confirmar";

describe("destinoSeguro", () => {
  it("mantém caminho interno", () => {
    expect(destinoSeguro("/redefinir-senha")).toBe("/redefinir-senha");
    expect(destinoSeguro("/estoque?aba=1")).toBe("/estoque?aba=1");
  });

  it("cai na home quando não veio nada", () => {
    expect(destinoSeguro(null)).toBe("/");
    expect(destinoSeguro(undefined)).toBe("/");
    expect(destinoSeguro("")).toBe("/");
  });

  it("recusa endereço de fora do app", () => {
    expect(destinoSeguro("//malicioso.com")).toBe("/");
    expect(destinoSeguro("https://malicioso.com")).toBe("/");
    expect(destinoSeguro("redefinir-senha")).toBe("/");
  });
});

describe("tipoAceito", () => {
  it("aceita os tipos de link de email previstos", () => {
    for (const tipo of ["recovery", "invite", "signup", "email", "magiclink"]) {
      expect(tipoAceito(tipo)).toBe(tipo);
    }
  });

  it("recusa tipo desconhecido, vazio ou com caixa diferente", () => {
    expect(tipoAceito("email_change")).toBeNull();
    expect(tipoAceito("sms")).toBeNull();
    expect(tipoAceito("RECOVERY")).toBeNull();
    expect(tipoAceito("")).toBeNull();
    expect(tipoAceito(null)).toBeNull();
    expect(tipoAceito(undefined)).toBeNull();
  });
});
