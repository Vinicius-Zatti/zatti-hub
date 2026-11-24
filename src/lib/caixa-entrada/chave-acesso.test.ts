import { describe, expect, it } from "vitest";
import { chaveNoTexto, chaveValida, cnpjDaChave } from "./chave-acesso";

// Chave real da Betones (NF 5987, emitente 23.023.375/0001-72), que entrou pela SEFAZ e de novo por e-mail em PDF.
const CHAVE = "35261123023375000172550010000059871634464757";

describe("chave de acesso", () => {
  it("aceita a chave com dígito certo, com ou sem espaços", () => {
    expect(chaveValida(CHAVE)).toBe(CHAVE);
    expect(chaveValida(CHAVE.replace(/(\d{4})/g, "$1 "))).toBe(CHAVE);
  });

  it("recusa dígito errado e tamanho errado", () => {
    expect(chaveValida(CHAVE.slice(0, 43) + "8")).toBeNull();
    expect(chaveValida(CHAVE.slice(1))).toBeNull();
    expect(chaveValida(null)).toBeNull();
  });

  it("acha a chave no nome do arquivo", () => {
    expect(chaveNoTexto(`${CHAVE}.pdf`)).toBe(CHAVE);
    expect(chaveNoTexto(`NFe${CHAVE}.xml`)).toBe(CHAVE);
    expect(chaveNoTexto("faturas (2).pdf")).toBeNull();
    expect(chaveNoTexto(`1${CHAVE}.pdf`)).toBeNull();
  });

  it("tira o CNPJ do emitente da chave", () => {
    expect(cnpjDaChave(CHAVE)).toBe("23023375000172");
    expect(cnpjDaChave("35261100012345678901550010000059871634464757")).toBeNull();
  });
});
