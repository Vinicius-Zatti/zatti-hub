import { describe, expect, it } from "vitest";
import { camposAlteradosProduto } from "./produto-alteracoes";
import type { Produto } from "./types";

// Edição de Dados grava só os campos alterados (parecer do Codex de 26/10/2026).

const gravado: Produto = {
  sku: "HORTOM001",
  posicao: 3,
  grupo: "HOR",
  nome: "tomate",
  unidadeBase: "KG",
  precoUnitario: 10,
  estoqueNecessarioSemana: null,
  estoqueMinimo: null,
  nomeCompra: "",
  unidadeEmbalagemFornecedor: "",
  qtdUnidadeBasePorEmbalagem: null,
  precoFornecedor: null,
  fornecedor1: "Ceasa",
  fornecedor2: "",
  fornecedor3: "",
  fornecedor4: "",
  observacoes: "",
  ativo: true,
  revenda: false,
};

describe("camposAlteradosProduto", () => {
  it("sem mudança, nada vai ao banco (nem as vagas de fornecedor vazias)", () => {
    expect(camposAlteradosProduto(gravado, { ...gravado })).toEqual({});
  });

  it("nome de compra padrão da grade continua sendo gravado", () => {
    // A grade preenche o nome de compra vazio com o nome; o banco ainda tem "".
    expect(camposAlteradosProduto(gravado, { ...gravado, nomeCompra: "tomate", observacoes: "maduro" })).toEqual({
      nome_compra: "tomate",
      observacoes: "maduro",
    });
  });

  it("valor apagado de propósito vai como nulo; booleano e vaga também", () => {
    expect(
      camposAlteradosProduto(gravado, { ...gravado, precoUnitario: null, ativo: false, fornecedor1: "" })
    ).toEqual({ preco_unitario: null, ativo: false, fornecedor_1: "" });
  });
});
