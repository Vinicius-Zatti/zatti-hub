import { describe, expect, it, vi } from "vitest";
import { validar, produtoSchema, marcarRecebidoSchema } from "./validacao";
import { ErroPublico } from "./erros";

const produtoValido = {
  sku: "ABC123",
  posicao: 1,
  grupo: "Bebidas",
  nome: "Refrigerante 2L",
  unidadeBase: "UN",
  precoUnitario: 10.5,
  estoqueNecessarioSemana: 20,
  estoqueMinimo: 5,
  nomeCompra: "Refri 2L",
  unidadeEmbalagemFornecedor: "CX",
  qtdUnidadeBasePorEmbalagem: 6,
  precoFornecedor: 8,
  fornecedor1: "F001",
  fornecedor2: "",
  fornecedor3: "",
  fornecedor4: "",
  observacoes: "",
  ativo: true,
};

describe("validar / produtoSchema", () => {
  it("aceita um produto válido e devolve o dado tipado", () => {
    expect(validar(produtoSchema, produtoValido, "teste")).toEqual(produtoValido);
  });

  it("rejeita sku vazio", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => validar(produtoSchema, { ...produtoValido, sku: "" }, "teste")).toThrow(ErroPublico);
    spy.mockRestore();
  });

  it("rejeita preço negativo (limite numérico contra dado malicioso/errado)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => validar(produtoSchema, { ...produtoValido, precoUnitario: -5 }, "teste")).toThrow(ErroPublico);
    spy.mockRestore();
  });

  it("rejeita nome maior que o limite (proteção contra payload gigante)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const nomeGigante = "a".repeat(10_000);
    expect(() => validar(produtoSchema, { ...produtoValido, nome: nomeGigante }, "teste")).toThrow(ErroPublico);
    spy.mockRestore();
  });

  it("mensagem de erro nunca expõe detalhe interno do zod (fica só no log)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      validar(produtoSchema, { ...produtoValido, sku: "" }, "teste");
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ErroPublico);
      expect((err as Error).message).toBe("Alguns campos não são válidos. Confere e tenta de novo.");
    }
    spy.mockRestore();
  });
});

describe("marcarRecebidoSchema (superfície corrigida - ver src/lib/pedidos.ts)", () => {
  it("aceita um payload de recebimento válido", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dado = {
      pedidoId: "11111111-1111-1111-1111-111111111111",
      recebido: true,
      observacaoEntrega: null,
      itensRecebidos: [{ sku: "ABC123", quantidadeRecebida: 10 }],
    };
    expect(validar(marcarRecebidoSchema, dado, "teste")).toEqual(dado);
    spy.mockRestore();
  });

  it("rejeita pedidoId vazio (não pode chegar até a query sem id)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      validar(
        marcarRecebidoSchema,
        { pedidoId: "", recebido: true, observacaoEntrega: null, itensRecebidos: [] },
        "teste"
      )
    ).toThrow(ErroPublico);
    spy.mockRestore();
  });
});
