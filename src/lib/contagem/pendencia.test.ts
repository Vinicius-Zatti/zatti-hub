import { describe, expect, it } from "vitest";
import { setoresDaPendencia } from "./pendencia";
import type { ItemInventario } from "@/lib/types";

function linha(data: string, sku: string, nome: string, setorId: string | null): ItemInventario {
  return {
    data,
    mes: data.slice(3),
    sku,
    grupo: "",
    nome,
    unidadeBase: "UN",
    quantidade: 1,
    precoUnitario: null,
    total: null,
    alerta: "",
    setorId,
  };
}

describe("setoresDaPendencia", () => {
  it("devolve o setor da contagem mais recente do item avulso, ignorando maiúscula e espaço", () => {
    const inventario = [
      linha("12/10/2026", "PENDENTE-tabasco-1", "tabasco", "bar"),
      linha("18/10/2026", "PENDENTE-tabasco-2", "Tabasco ", "cozinha"),
    ];
    expect(setoresDaPendencia(inventario, "tabasco")).toEqual(["cozinha"]);
  });

  it("junta os setores que contaram o item na mesma data, sem repetir", () => {
    const inventario = [
      linha("18/10/2026", "PENDENTE-gelo-1", "gelo", "bar"),
      linha("18/10/2026", "PENDENTE-gelo-2", "gelo", "cozinha"),
      linha("18/10/2026", "PENDENTE-gelo-3", "gelo", "bar"),
    ];
    expect(setoresDaPendencia(inventario, "gelo")).toEqual(["bar", "cozinha"]);
  });

  it("não usa produto já cadastrado nem linha sem setor", () => {
    const inventario = [
      linha("18/10/2026", "BEBTAB001", "tabasco", "bar"),
      linha("18/10/2026", "PENDENTE-tabasco-1", "tabasco", null),
    ];
    expect(setoresDaPendencia(inventario, "tabasco")).toEqual([]);
  });

  it("contagem mais recente sem setor não apaga o setor de uma contagem anterior", () => {
    const inventario = [
      linha("12/10/2026", "PENDENTE-ovo-1", "ovo", "cozinha"),
      linha("18/10/2026", "PENDENTE-ovo-2", "ovo", null),
    ];
    expect(setoresDaPendencia(inventario, "ovo")).toEqual(["cozinha"]);
  });
});
