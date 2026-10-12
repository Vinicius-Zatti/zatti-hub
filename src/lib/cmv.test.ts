import { describe, expect, it } from "vitest";
import { calcularCmv, datasDeContagem, datasParciais, itensSemValor, valorContagem } from "./cmv";
import type { AndamentoSetor } from "./contagem/setor";
import type { ItemInventario } from "@/lib/types";

function item(data: string, quantidade: number, setor?: string): ItemInventario {
  return {
    data,
    mes: "setembro 2026",
    sku: "HORLTA001",
    grupo: "HOR",
    nome: "limao tahiti",
    unidadeBase: "KG",
    quantidade,
    precoUnitario: 10,
    total: quantidade * 10,
    alerta: "",
    id: `${data}-${setor ?? "legado"}`,
    setorId: setor ?? null,
    setorNome: setor ?? null,
  };
}

function setor(nome: string, situacao: "pendente" | "concluido"): AndamentoSetor {
  return { setorId: nome, setorNome: nome, situacao, enviadoEm: null, enviadoPor: null };
}

const ITENS = [item("10/09/2026", 5, "Bar"), item("17/09/2026", 2, "Bar")];

describe("datas aceitas pelo CMV", () => {
  it("recusa data parcial", () => {
    const andamento = new Map([
      ["10/09/2026", [setor("Bar", "concluido"), setor("Cozinha", "concluido")]],
      ["17/09/2026", [setor("Bar", "concluido"), setor("Cozinha", "pendente")]],
    ]);

    expect(datasDeContagem(ITENS, andamento)).toEqual(["10/09/2026"]);
  });

  it("explica a data que ficou de fora", () => {
    const andamento = new Map([
      ["17/09/2026", [setor("Bar", "concluido"), setor("Cozinha", "pendente")]],
    ]);

    expect(datasParciais(ITENS, andamento)).toEqual([
      { data: "17/09/2026", aviso: "Contagem parcial. Faltam: Cozinha." },
    ]);
  });

  it("aceita data completa", () => {
    const andamento = new Map([
      ["10/09/2026", [setor("Bar", "concluido")]],
      ["17/09/2026", [setor("Bar", "concluido")]],
    ]);

    expect(datasDeContagem(ITENS, andamento)).toEqual(["17/09/2026", "10/09/2026"]);
    expect(datasParciais(ITENS, andamento)).toEqual([]);
  });

  it("aceita contagem legada, sem controle de setor", () => {
    // Dom Quixote, Adega e Zatti Burger têm contagens anteriores ao setor.
    // Se elas virassem "parciais", o CMV desses clientes ficaria sem data.
    expect(datasDeContagem(ITENS)).toEqual(["17/09/2026", "10/09/2026"]);
    expect(datasParciais(ITENS)).toEqual([]);
  });
});

describe("valor da contagem", () => {
  it("soma todas as linhas da data, inclusive o mesmo SKU de setores diferentes", () => {
    const itens = [item("17/09/2026", 2, "Bar"), item("17/09/2026", 4, "Cozinha")];
    expect(valorContagem(itens, "17/09/2026")).toBe(60);
  });
});

describe("calcularCmv valida a elegibilidade mesmo chamado direto", () => {
  const base = { pedidos: [], faturamento: 1000, itensInventario: ITENS };

  it("recusa data parcial com erro claro", () => {
    const andamento = new Map([
      ["10/09/2026", [setor("Bar", "concluido")]],
      ["17/09/2026", [setor("Bar", "concluido"), setor("Cozinha", "pendente")]],
    ]);
    expect(() =>
      calcularCmv({ ...base, dataInicial: "10/09/2026", dataFinal: "17/09/2026", andamentoPorData: andamento }),
    ).toThrow("A contagem de 17/09/2026 está parcial e não pode entrar no CMV. Contagem parcial. Faltam: Cozinha.");
  });

  it("nao muda a formula: legado continua com os mesmos numeros", () => {
    const resultado = calcularCmv({
      ...base,
      dataInicial: "10/09/2026",
      dataFinal: "17/09/2026",
      andamentoPorData: new Map(),
    });
    expect(resultado.valorEstoqueInicial).toBe(50);
    expect(resultado.valorEstoqueFinal).toBe(20);
    expect(resultado.custoConsumido).toBe(30);
    expect(resultado.cmvPercentual).toBe(3);
  });
});

describe("itens sem valor", () => {
  it("conta so os itens da data com total nulo, que seguem valendo zero no calculo", () => {
    const semPreco: ItemInventario = { ...item("17/09/2026", 3, "Bar"), id: "x", precoUnitario: null, total: null };
    const itens = [...ITENS, semPreco];
    expect(itensSemValor(itens, "17/09/2026")).toBe(1);
    expect(itensSemValor(itens, "10/09/2026")).toBe(0);
    expect(valorContagem(itens, "17/09/2026")).toBe(20);
  });
});
