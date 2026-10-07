import { describe, expect, it } from "vitest";
import { ehProduzidoNaCasa, letrasPre, montarSkuSugerido } from "./montar";

const vazio = new Set<string>();

describe("marcador da casa", () => {
  it("reconhece o marcador no fim, em qualquer caixa", () => {
    expect(ehProduzidoNaCasa("chimichurri da casa")).toBe(true);
    expect(ehProduzidoNaCasa("Maionese verde DA CASA ")).toBe(true);
  });
  it("não reconhece quando o marcador não está no fim ou não existe", () => {
    expect(ehProduzidoNaCasa("chimichurri")).toBe(false);
    expect(ehProduzidoNaCasa("da casa chimichurri")).toBe(false);
  });
});

describe("montagem do SKU sugerido", () => {
  it("PRE: PRE + 6 letras, sem número, grupo vindo do marcador", () => {
    expect(
      montarSkuSugerido({ nome: "chimichurri da casa", grupoIa: "MER", letrasIa: "CHIMIC", referenciaIa: "001", skusExistentes: vazio }),
    ).toEqual({ sku: "PRECHIMIC", grupo: "PRE", avisoColisao: null });
  });

  it("PRE de uma palavra longa usa as 6 primeiras letras", () => {
    expect(
      montarSkuSugerido({ nome: "coleslaw da casa", grupoIa: "PRE", letrasIa: "COLESLAW", referenciaIa: "", skusExistentes: vazio }).sku,
    ).toBe("PRECOLESL");
  });

  it("PRE de uma palavra curta fecha com CAS, mesmo se a IA mandar a palavra inteira", () => {
    expect(
      montarSkuSugerido({ nome: "pesto da casa", grupoIa: "PRE", letrasIa: "PESTO", referenciaIa: "", skusExistentes: vazio }).sku,
    ).toBe("PREPESCAS");
  });

  it("PRE de uma palavra curta fecha com CAS", () => {
    expect(
      montarSkuSugerido({ nome: "pesto da casa", grupoIa: "PRE", letrasIa: "PES", referenciaIa: "", skusExistentes: vazio }).sku,
    ).toBe("PREPESCAS");
  });

  it("PRE que colide não ganha número, avisa para ajustar", () => {
    const r = montarSkuSugerido({
      nome: "maionese verde da casa",
      grupoIa: "PRE",
      letrasIa: "MAIVER",
      referenciaIa: "",
      skusExistentes: new Set(["PREMAIVER"]),
    });
    expect(r.sku).toBe("PREMAIVER");
    expect(r.avisoColisao).toContain("PREMAIVER");
  });

  it("nome sem o marcador nunca vira PRE", () => {
    expect(
      montarSkuSugerido({ nome: "chimichurri", grupoIa: "PRE", letrasIa: "CHI", referenciaIa: "001", skusExistentes: vazio }),
    ).toEqual({ sku: "MERCHI001", grupo: "MER", avisoColisao: null });
  });

  it("insumo: grupo + 3 letras + referência, subindo a referência na colisão", () => {
    expect(
      montarSkuSugerido({
        nome: "cheddar fatiado",
        grupoIa: "LAT",
        letrasIa: "cfa",
        referenciaIa: "001",
        skusExistentes: new Set(["LATCFA001"]),
      }),
    ).toEqual({ sku: "LATCFA002", grupo: "LAT", avisoColisao: null });
  });
});

describe("letras do PRE saem do nome, não da IA", () => {
  it("segue os exemplos do padrão canônico", () => {
    expect(letrasPre("barbecue de goiabada da casa")).toBe("BARGOI");
    expect(letrasPre("cebola caramelizada da casa")).toBe("CEBCAR");
    expect(letrasPre("coleslaw da casa")).toBe("COLESL");
    expect(letrasPre("maionese de limão siciliano da casa")).toBe("MAILIM");
    expect(letrasPre("maionese verde da casa")).toBe("MAIVER");
    expect(letrasPre("chimichurri da casa")).toBe("CHIMIC");
    expect(letrasPre("ancho da casa")).toBe("ANCCAS");
    expect(letrasPre("pesto da casa")).toBe("PESCAS");
  });

  it("resposta errada da IA não muda o SKU do PRE", () => {
    for (const letrasIa of ["CHI", "", "XYZXYZ", "chimichurri"]) {
      expect(
        montarSkuSugerido({ nome: "chimichurri da casa", grupoIa: "MER", letrasIa, referenciaIa: "007", skusExistentes: vazio }).sku,
      ).toBe("PRECHIMIC");
    }
  });
});
