import { describe, expect, it } from "vitest";
import {
  agruparPorFornecedor,
  mesclarPedidosPorFornecedorCanonico,
  nomeFornecedorCanonico,
  ordenarDatasContagemBase,
  ordenarFornecedores,
  SEM_FORNECEDOR,
} from "./pedido";
import type { Pedido, PedidoItem, SugestaoCompra } from "@/lib/types";

function pedidoItem(sku: string): PedidoItem {
  return {
    sku,
    nome: sku,
    nomeCompra: sku,
    unidadeBase: "UN",
    quantidadePedida: 1,
    quantidadeRecebida: null,
    precoAntigo: null,
    precoAtualizado: null,
    precoConfirmado: false,
    vencedorConfirmado: true,
  };
}

function pedido(fornecedor: string, atualizadoEm: string, itens: PedidoItem[]): Pedido {
  return {
    id: `pedido-${fornecedor}-${atualizadoEm}`,
    fornecedor,
    dataContagemBase: "18/08/2026",
    previsaoEntrega: null,
    observacaoEntrega: null,
    recebido: false,
    criadoEm: atualizadoEm,
    atualizadoEm,
    itens,
  };
}

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

describe("nomeFornecedorCanonico", () => {
  it("resolve variação de espaço/maiúscula pro nome exato do cadastro", () => {
    expect(nomeFornecedorCanonico("sem limite ", ["Sem Limite"])).toBe("Sem Limite");
  });

  it("mantém o nome como veio quando não acha correspondência", () => {
    expect(nomeFornecedorCanonico("Distribuidora Fantasma", ["Sem Limite"])).toBe("Distribuidora Fantasma");
  });
});

describe("mesclarPedidosPorFornecedorCanonico", () => {
  it("renomeia pedido salvo com grafia velha pro nome canônico, sem duplicar bloco", () => {
    // Achado real no Editor de Espelhos: pedido confirmado sob a grafia
    // antiga ("sem limite ") ficava órfão do nome atual do cadastro e
    // aparecia ao lado de um bloco vazio com o nome certo.
    const pedidos = [pedido("sem limite ", "2026-08-18T10:00:00Z", [pedidoItem("CERV-BUD")])];
    const resultado = mesclarPedidosPorFornecedorCanonico(pedidos, ["Sem Limite"]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].fornecedor).toBe("Sem Limite");
    expect(resultado[0].itens.map((i) => i.sku)).toEqual(["CERV-BUD"]);
  });

  it("une os itens de 2 pedidos salvos que canonizam pro mesmo fornecedor, sem perder nenhum", () => {
    const antigo = pedido("Sem  Limite", "2026-08-10T10:00:00Z", [pedidoItem("CERV-BUD")]);
    const novo = pedido("Sem Limite", "2026-08-18T10:00:00Z", [pedidoItem("CERV-SKOL")]);
    const resultado = mesclarPedidosPorFornecedorCanonico([antigo, novo], ["Sem Limite"]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(novo.id); // pedido mais recente empresta id/metadados
    expect(resultado[0].itens.map((i) => i.sku).sort()).toEqual(["CERV-BUD", "CERV-SKOL"]);
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
