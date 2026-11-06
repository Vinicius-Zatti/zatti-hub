import { describe, expect, it } from "vitest";
import { bloqueioTrocaDataConsolidado, podeEscolherDataConsolidado } from "./consolidado-data";

describe("data do fechamento de vendas", () => {
  it("só o master escolhe a data", () => {
    expect(podeEscolherDataConsolidado("master")).toBe(true);
    expect(podeEscolherDataConsolidado("gestao")).toBe(false);
    expect(podeEscolherDataConsolidado("operacional")).toBe(false);
  });

  it("master troca a data de um dia já lançado", () => {
    expect(bloqueioTrocaDataConsolidado("master", "2026-11-06", "2026-11-05")).toBeNull();
  });

  it("gestão edita sem trocar a data, como hoje", () => {
    expect(bloqueioTrocaDataConsolidado("gestao", "2026-11-06", "2026-11-06")).toBeNull();
    expect(bloqueioTrocaDataConsolidado("gestao", "2026-11-06", "2026-11-05")).toMatch(/não pode ser trocada/);
    expect(bloqueioTrocaDataConsolidado("operacional", "2026-11-06", "2026-11-05")).not.toBeNull();
  });
});
