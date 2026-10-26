import { describe, expect, it } from "vitest";
import { filtrarPorFornecedorOuItem, filtrarPorNomeOuSku, fornecedorCasaBusca } from "./busca-lista";

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

describe("filtrarPorFornecedorOuItem", () => {
  const pedido = [
    { sku: "S1", nome: "coca-cola lata", nomeCompra: "refrigerante cola 350ml" },
    { sku: "S2", nome: "guaraná lata", nomeCompra: null },
    { sku: "S3", nome: "água sem gás", nomeCompra: "agua mineral 500ml" },
  ];
  const compra = (i: (typeof pedido)[number]) => [i.nomeCompra];

  it("termo do fornecedor traz o pedido inteiro, sem acento e sem caixa, por trecho", () => {
    expect(filtrarPorFornecedorOuItem("Mega G Distribuidora", pedido, "mega g", compra)).toHaveLength(3);
    expect(filtrarPorFornecedorOuItem("Mega G Distribuidora", pedido, "MEGA G", compra)).toHaveLength(3);
    expect(filtrarPorFornecedorOuItem("Açougue São João", pedido, "acougue sao", compra)).toHaveLength(3);
  });

  it("termo de item continua igual: nome, SKU ou Nome de Compra", () => {
    expect(filtrarPorFornecedorOuItem("Mega G", pedido, "guarana", compra).map((i) => i.sku)).toEqual(["S2"]);
    expect(filtrarPorFornecedorOuItem("Mega G", pedido, "s3", compra).map((i) => i.sku)).toEqual(["S3"]);
    expect(filtrarPorFornecedorOuItem("Mega G", pedido, "refrigerante", compra).map((i) => i.sku)).toEqual(["S1"]);
    expect(filtrarPorFornecedorOuItem("Mega G", pedido, "picanha", compra)).toEqual([]);
  });

  it("bate no fornecedor e num item: o pedido inteiro aparece", () => {
    expect(filtrarPorFornecedorOuItem("Distribuidora Água Viva", pedido, "agua", compra)).toHaveLength(3);
    expect(filtrarPorFornecedorOuItem("Mega G", pedido, "agua", compra).map((i) => i.sku)).toEqual(["S3"]);
  });

  it("termo vazio devolve tudo e não conta como fornecedor encontrado", () => {
    expect(filtrarPorFornecedorOuItem("Mega G", pedido, "  ", compra)).toHaveLength(3);
    expect(fornecedorCasaBusca("Mega G", "  ")).toBe(false);
  });

  it("só filtra: devolve cópia e não altera a lista original", () => {
    const resultado = filtrarPorFornecedorOuItem("Mega G", pedido, "mega", compra);
    expect(resultado).not.toBe(pedido);
    expect(pedido).toHaveLength(3);
  });
});
