import { describe, expect, it } from "vitest";
import { contagemPorSetorVale, historicoPorSetorLegivel } from "@/lib/contagem/ativacao";

describe("contagemPorSetorVale", () => {
  it("só vale com estoque no banco e a chave da unidade ligada", () => {
    expect(contagemPorSetorVale({ fonteDadosEstoque: "banco", contagemPorSetorHabilitada: true })).toBe(true);
    expect(contagemPorSetorVale({ fonteDadosEstoque: "banco", contagemPorSetorHabilitada: false })).toBe(false);
    expect(contagemPorSetorVale({ fonteDadosEstoque: "planilha", contagemPorSetorHabilitada: true })).toBe(false);
    expect(contagemPorSetorVale({ fonteDadosEstoque: "planilha", contagemPorSetorHabilitada: false })).toBe(false);
  });

  it("histórico por setor é legível com o estoque no banco, ligada ou não", () => {
    expect(historicoPorSetorLegivel({ fonteDadosEstoque: "banco" })).toBe(true);
    expect(historicoPorSetorLegivel({ fonteDadosEstoque: "planilha" })).toBe(false);
  });
});
