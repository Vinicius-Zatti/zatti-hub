import { describe, expect, it } from "vitest";
import { filtrarPorNomeOuSku } from "./busca-lista";

const itens = [
  { sku: "MEGA00101", nome: "Açúcar Cristal" },
  { sku: "MEGA00202", nome: "Pão de Alho" },
  { sku: "MEGA00303", nome: "Limão Taiti" },
];

describe("filtrarPorNomeOuSku", () => {
  it("acha pelo nome com ou sem acento e em qualquer caixa", () => {
    expect(filtrarPorNomeOuSku(itens, "acucar").map((i) => i.sku)).toEqual(["MEGA00101"]);
    expect(filtrarPorNomeOuSku(itens, "AÇÚCAR").map((i) => i.sku)).toEqual(["MEGA00101"]);
    expect(filtrarPorNomeOuSku(itens, " limao ").map((i) => i.sku)).toEqual(["MEGA00303"]);
    expect(filtrarPorNomeOuSku(itens, "pão").map((i) => i.sku)).toEqual(["MEGA00202"]);
  });

  it("acha pelo SKU", () => {
    expect(filtrarPorNomeOuSku(itens, "mega00202").map((i) => i.nome)).toEqual(["Pão de Alho"]);
  });

  it("termo vazio devolve a lista inteira e sem resultado devolve vazio", () => {
    expect(filtrarPorNomeOuSku(itens, "   ")).toHaveLength(3);
    expect(filtrarPorNomeOuSku(itens, "picanha")).toEqual([]);
  });
});

describe("filtrarPorNomeOuSku com outros nomes", () => {
  it("acha pelo Nome de Compra quando informado", () => {
    const lista = [
      { sku: "S1", nome: "Coca lata", nomeCompra: "Refrigerante Coca-Cola 350ml" },
      { sku: "S2", nome: "Guaraná", nomeCompra: null },
    ];
    expect(filtrarPorNomeOuSku(lista, "refrigerante", (i) => [i.nomeCompra]).map((i) => i.sku)).toEqual(["S1"]);
    expect(filtrarPorNomeOuSku(lista, "refrigerante")).toEqual([]);
  });
});
