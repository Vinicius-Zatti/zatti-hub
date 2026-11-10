import { describe, expect, it } from "vitest";
import { campoCsv, linhaCsv } from "./csv";

describe("campoCsv", () => {
  it("neutraliza texto que viraria fórmula", () => {
    expect(campoCsv("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(campoCsv("+55 31")).toBe("'+55 31");
    expect(campoCsv("@SOMA(A1)")).toBe("'@SOMA(A1)");
    expect(campoCsv("-cmd")).toBe("'-cmd");
    expect(campoCsv("  =1+1")).toBe("'  =1+1");
  });

  it("deixa número puro intacto, inclusive negativo", () => {
    expect(campoCsv("-12,50")).toBe("-12,50");
    expect(campoCsv("3")).toBe("3");
    expect(campoCsv("1234,5")).toBe("1234,5");
  });

  it("mantém as aspas para separador e quebra de linha", () => {
    expect(campoCsv("a;b")).toBe("\"a;b\"");
    expect(campoCsv("Fornecedor \"X\"")).toBe("\"Fornecedor \"\"X\"\"\"");
    expect(campoCsv("Texto normal")).toBe("Texto normal");
  });

  it("monta a linha com ponto e vírgula", () => {
    expect(linhaCsv(["10/11/2026", "=1", "-3,00"])).toBe("10/11/2026;'=1;-3,00");
  });
});
