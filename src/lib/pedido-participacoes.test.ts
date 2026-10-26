import { describe, expect, it } from "vitest";
import { incluirParticipacoes, unirConcorrentes } from "./pedido";
import type { SugestaoCompra } from "./types";

// Parecer do Codex (24/10/2026, ponto 3): participação do fornecedor por
// cotação, independente das 4 vagas do Cadastro.

function sugestao(sku: string, fornecedores: string[] = []): SugestaoCompra {
  return {
    sku,
    grupo: "PRO",
    nome: sku.toLowerCase(),
    unidadeBase: "KG",
    precoUnitario: 10,
    precoNaContagem: null,
    estoqueAtual: null,
    estoqueNecessario: null,
    quantidadeSugerida: 0,
    precisaComprar: true,
    fornecedores,
    nomeCompra: "",
    unidadeEmbalagemFornecedor: "",
    qtdUnidadeBasePorEmbalagem: null,
    alerta: "",
    setoresQueNaoContaram: [],
  };
}

describe("incluirParticipacoes", () => {
  const cadastro = ["JM", "Bahia Carnes"];
  const doSku = (sku: string) => (sku === "SAIU00001" ? null : sugestao(sku));

  it("devolve o item ao bloco do avulso que perdeu (fora das 4 vagas)", () => {
    const base = { JM: [sugestao("PROCDB001", ["JM"])] };
    const r = incluirParticipacoes(base, [{ fornecedor: "bahia  carnes", sku: "PROCDB001" }], cadastro, doSku);
    expect(Object.keys(r)).toEqual(["JM", "Bahia Carnes"]);
    expect(r["Bahia Carnes"].map((i) => i.sku)).toEqual(["PROCDB001"]);
    expect(base).toEqual({ JM: [sugestao("PROCDB001", ["JM"])] }); // não altera a entrada
  });

  it("não duplica item que já está no bloco e ignora SKU fora do Cadastro", () => {
    const base = { JM: [sugestao("PROCDB001", ["JM"])] };
    const r = incluirParticipacoes(
      base,
      [
        { fornecedor: "JM", sku: "PROCDB001" },
        { fornecedor: "JM", sku: "SAIU00001" },
      ],
      cadastro,
      doSku
    );
    expect(r.JM).toHaveLength(1);
  });
});

describe("unirConcorrentes", () => {
  it("junta tela e banco sem repetir grafia e sem o vencedor", () => {
    expect(unirConcorrentes("JM", ["Ceasa"], ["jm", "Ceasa ", "bahia carnes"], ["JM", "Ceasa", "Bahia Carnes"])).toEqual([
      "Ceasa",
      "Bahia Carnes",
    ]);
  });

  it("sem participação fica a lista da tela", () => {
    expect(unirConcorrentes("JM", ["Ceasa"], [], ["JM", "Ceasa"])).toEqual(["Ceasa"]);
  });
});
