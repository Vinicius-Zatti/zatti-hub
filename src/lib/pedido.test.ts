import { describe, expect, it } from "vitest";
import { agruparPorFornecedor, ordenarDatasContagemBase, ordenarFornecedores, SEM_FORNECEDOR } from "./pedido";
import type { SugestaoCompra } from "@/lib/types";

function item(sku: string, fornecedores: string[], precisaComprar = true): SugestaoCompra {
  return {
    sku,
    grupo: "PRO",
    nome: sku,
    unidadeBase: "UN",
    precoUnitario: 10,
    precoNaContagem: null,
    estoqueAtual: null,
    estoqueNecessario: 1,
    quantidadeSugerida: 1,
    precisaComprar,
    fornecedores,
    nomeCompra: sku,
    unidadeEmbalagemFornecedor: "UN",
    qtdUnidadeBasePorEmbalagem: 1,
    alerta: "",
  };
}

describe("agruparPorFornecedor", () => {
  it("agrupa pelo nome bruto quando não recebe o cadastro (comportamento antigo)", () => {
    const grupos = agruparPorFornecedor([item("A", ["Sem Limite"]), item("B", ["sem limite "])]);
    expect(Object.keys(grupos).sort()).toEqual(["Sem Limite", "sem limite "]);
  });

  it("funde variações de espaço/maiúscula no nome bruto no nome canônico do cadastro", () => {
    // Achado real: cadastro tem só 1 "Sem Limite", mas produtos antigos
    // carregavam texto ligeiramente diferente (espaço, maiúscula) - Pedidos
    // mostrava 2 blocos pro mesmo fornecedor.
    const itens = [item("A", ["Sem Limite"]), item("B", ["sem limite "]), item("C", ["SEM LIMITE"])];
    const grupos = agruparPorFornecedor(itens, ["Sem Limite"]);
    expect(Object.keys(grupos)).toEqual(["Sem Limite"]);
    expect(grupos["Sem Limite"].map((i) => i.sku)).toEqual(["A", "B", "C"]);
  });

  it("mantém fornecedor sem correspondência no cadastro como está (não inventa nome)", () => {
    const grupos = agruparPorFornecedor([item("A", ["Distribuidora Fantasma"])], ["Sem Limite"]);
    expect(Object.keys(grupos)).toEqual(["Distribuidora Fantasma"]);
  });

  it("não duplica a linha do item se 2 dos 4 campos Fornecedor apontarem pro mesmo fornecedor", () => {
    const grupos = agruparPorFornecedor([item("A", ["Sem Limite", "sem limite"])], ["Sem Limite"]);
    expect(grupos["Sem Limite"]).toHaveLength(1);
  });

  it("item sem fornecedor cadastrado só entra no grupo avulso se precisa comprar", () => {
    const comNecessidade = agruparPorFornecedor([item("A", [], true)]);
    expect(Object.keys(comNecessidade)).toEqual([SEM_FORNECEDOR]);

    const semNecessidade = agruparPorFornecedor([item("B", [], false)]);
    expect(Object.keys(semNecessidade)).toEqual([]);
  });
});

describe("ordenarFornecedores", () => {
  it('coloca "Sem fornecedor cadastrado" sempre primeiro, resto em ordem alfabética pt-BR', () => {
    expect(ordenarFornecedores(["Zoo", SEM_FORNECEDOR, "Ávila"])).toEqual([SEM_FORNECEDOR, "Ávila", "Zoo"]);
  });
});

describe("ordenarDatasContagemBase", () => {
  it("ordena por data de verdade, não por comparação de texto (dia vem antes do ano no formato BR)", () => {
    // "05/08/2026" é alfabeticamente menor que "17/07/2026", mas
    // cronologicamente posterior - ordenar como texto dava resultado errado.
    expect(ordenarDatasContagemBase(["17/07/2026", "05/08/2026", "01/01/2026"])).toEqual([
      "05/08/2026",
      "17/07/2026",
      "01/01/2026",
    ]);
  });
});
