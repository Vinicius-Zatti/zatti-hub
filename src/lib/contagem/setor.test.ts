import { describe, expect, it } from "vitest";
import {
  avisoDeContagemParcial,
  consolidarPorSku,
  quantidadePorSku,
  setoresPendentes,
  situacaoDaData,
  skusIncompletos,
  type AndamentoSetor,
  type EscopoSetor,
} from "./setor";
import type { ItemInventario } from "@/lib/types";

function item(
  sku: string,
  quantidade: number | null,
  setor?: { id: string; nome: string },
  extra: Partial<ItemInventario> = {},
): ItemInventario {
  return {
    data: "17/09/2026",
    mes: "setembro 2026",
    sku,
    grupo: "HOR",
    nome: sku.toLowerCase(),
    unidadeBase: "KG",
    quantidade,
    precoUnitario: 10,
    total: quantidade === null ? null : quantidade * 10,
    alerta: "",
    id: `${sku}-${setor?.id ?? "legado"}`,
    setorId: setor?.id ?? null,
    setorNome: setor?.nome ?? null,
    ...extra,
  };
}

const BAR = { id: "s-bar", nome: "Bar" };
const COZINHA = { id: "s-coz", nome: "Cozinha" };

function andamento(
  ...setores: { id: string; nome: string; situacao: "pendente" | "concluido" }[]
): AndamentoSetor[] {
  return setores.map((s) => ({
    setorId: s.id,
    setorNome: s.nome,
    situacao: s.situacao,
    enviadoEm: s.situacao === "concluido" ? "2026-09-17T12:00:00Z" : null,
    enviadoPor: s.situacao === "concluido" ? "user-1" : null,
  }));
}

describe("soma entre setores", () => {
  it("soma o mesmo SKU contado em dois setores", () => {
    const itens = [item("HORLTA001", 2, BAR), item("HORLTA001", 4, COZINHA)];
    const [limao] = consolidarPorSku(itens);

    expect(limao.total).toBe(6);
    expect(limao.valorTotal).toBe(60);
    expect(limao.porSetor).toHaveLength(2);
    expect(limao.parcial).toBe(false);
  });

  it("quantidadePorSku devolve a soma, nao a ultima linha gravada", () => {
    const itens = [item("HORLTA001", 2, BAR), item("HORLTA001", 4, COZINHA)];
    expect(quantidadePorSku(itens).get("HORLTA001")).toBe(6);
  });

  it("nao inventa zero quando nenhum setor informou quantidade", () => {
    const itens = [item("HORLTA001", null, BAR), item("HORLTA001", null, COZINHA)];
    expect(consolidarPorSku(itens)[0].total).toBeNull();
  });

  it("soma ignorando o setor que deixou o campo vazio", () => {
    const itens = [item("HORLTA001", null, BAR), item("HORLTA001", 4, COZINHA)];
    expect(consolidarPorSku(itens)[0].total).toBe(4);
  });
});

describe("contagem parcial", () => {
  const escopo: EscopoSetor[] = [
    { sku: "HORLTA001", setorId: BAR.id, setorNome: BAR.nome },
    { sku: "HORLTA001", setorId: COZINHA.id, setorNome: COZINHA.nome },
  ];

  it("marca o item e nomeia quem faltou quando so um setor contou", () => {
    const [limao] = consolidarPorSku([item("HORLTA001", 2, BAR)], escopo);

    expect(limao.total).toBe(2);
    expect(limao.parcial).toBe(true);
    expect(limao.setoresQueNaoContaram).toEqual(["Cozinha"]);
  });

  it("nao trata o setor que faltou como zero", () => {
    const [limao] = consolidarPorSku([item("HORLTA001", 2, BAR)], escopo);
    expect(limao.porSetor.map((s) => s.setorNome)).toEqual(["Bar"]);
  });

  it("skusIncompletos so lista quem realmente ficou faltando", () => {
    const itens = [item("HORLTA001", 2, BAR), item("MERARR001", 5, COZINHA)];
    const completo: EscopoSetor[] = [
      ...escopo,
      { sku: "MERARR001", setorId: COZINHA.id, setorNome: COZINHA.nome },
    ];
    const mapa = skusIncompletos(itens, completo);

    expect(mapa.get("HORLTA001")).toEqual(["Cozinha"]);
    expect(mapa.has("MERARR001")).toBe(false);
  });

  it("sem escopo (contagem legada) nada e marcado como parcial", () => {
    const [limao] = consolidarPorSku([item("HORLTA001", 2)], []);
    expect(limao.parcial).toBe(false);
  });

  it("quem manda e o snapshot, nao a designacao de hoje", () => {
    // O produto foi designado pra Cozinha DEPOIS que a data foi aberta: o
    // snapshot daquela data só tem o Bar, então a contagem continua completa.
    const escopoDaData: EscopoSetor[] = [
      { sku: "HORLTA001", setorId: BAR.id, setorNome: BAR.nome },
    ];
    const [limao] = consolidarPorSku([item("HORLTA001", 2, BAR)], escopoDaData);

    expect(limao.parcial).toBe(false);
    expect(limao.total).toBe(2);
  });
});

describe("situacao da data", () => {
  it("completa quando todos os setores fecharam", () => {
    const estado = andamento(
      { ...BAR, situacao: "concluido" },
      { ...COZINHA, situacao: "concluido" },
    );
    expect(situacaoDaData(estado)).toBe("completa");
    expect(avisoDeContagemParcial(estado)).toBe("");
  });

  it("parcial enquanto algum setor esta pendente", () => {
    const estado = andamento(
      { ...BAR, situacao: "concluido" },
      { ...COZINHA, situacao: "pendente" },
    );
    expect(situacaoDaData(estado)).toBe("parcial");
    expect(setoresPendentes(estado)).toEqual(["Cozinha"]);
    expect(avisoDeContagemParcial(estado)).toBe("Contagem parcial. Faltam: Cozinha.");
  });

  it("data sem controle de setor conta como legada, nao como parcial", () => {
    expect(situacaoDaData([])).toBe("legada");
    expect(avisoDeContagemParcial([])).toBe("");
  });

  it("aviso lista todos os setores que faltam", () => {
    const estado = andamento(
      { ...BAR, situacao: "pendente" },
      { ...COZINHA, situacao: "pendente" },
    );
    expect(avisoDeContagemParcial(estado)).toBe("Contagem parcial. Faltam: Bar e Cozinha.");
  });
});
