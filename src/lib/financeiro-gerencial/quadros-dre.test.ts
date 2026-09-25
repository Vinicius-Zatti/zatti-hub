import { describe, expect, it } from "vitest";
import type { LinhaDreAnual } from "./dre-anual";
import { mesDoResumo, montarQuadrosDre } from "./quadros-dre";

// Linhas anuais mínimas (jan..set com dado, out..dez futuros = null).
function linha(id: string, valores: (number | null)[]): LinhaDreAnual {
  return { id, rotulo: id, nivel: 0, valoresPorMes: valores, total: null, media: null };
}
const futuro = [null, null, null];
const LINHAS: LinhaDreAnual[] = [
  linha("receita_bruta", [0, 0, 0, 0, 0, 10000, 10000, 10000, 20000, ...futuro]),
  linha("margem", [0, 0, 0, 0, 0, 6000, 6000, 6000, 12000, ...futuro]),
  linha("custos_fixos", [0, 0, 0, 0, 0, 3000, 3000, 3000, 3000, ...futuro]),
  linha("resultado_liquido", [0, 0, 0, 0, 0, 3000, 3000, 3000, 9000, ...futuro]),
  linha("resultado_economico", [0, 0, 0, 0, 0, 2000, 2000, 2000, 8000, ...futuro]),
];

describe("quadros do topo da DRE (25/09)", () => {
  it("resumo do mês corrente (setembro), com % sobre a Receita Bruta, mês anterior e média de jun/jul/ago", () => {
    const quadros = montarQuadrosDre(LINHAS, 8);
    expect(quadros.mesesTrimestre).toEqual([5, 6, 7]);
    expect(quadros.resultadoLiquido.atual).toEqual({ valor: 9000, percentual: 0.45 });
    expect(quadros.resultadoLiquido.mesAnterior?.valor).toBe(3000);
    expect(quadros.resultadoLiquido.mediaTrimestre?.valor).toBe(3000);
    expect(quadros.resultadoEconomico.atual).toEqual({ valor: 8000, percentual: 0.4 });
  });

  it("Ponto de Equilíbrio = Custos Fixos ÷ % Margem; % = receita do mês ÷ ponto de equilíbrio", () => {
    const { pontoDeEquilibrio } = montarQuadrosDre(LINHAS, 8);
    expect(pontoDeEquilibrio.atual.valor).toBe(5000); // 3000 / 0,6
    expect(pontoDeEquilibrio.atual.percentual).toBe(4); // 20000 / 5000 = 400%
    expect(pontoDeEquilibrio.mediaTrimestre?.valor).toBe(5000);
  });

  it("margem zero no mês: Ponto de Equilíbrio 'sem margem'", () => {
    const { pontoDeEquilibrio } = montarQuadrosDre(LINHAS, 4);
    expect(pontoDeEquilibrio.atual.semMargem).toBe(true);
    expect(pontoDeEquilibrio.atual.valor).toBeNull();
  });

  it("mês do resumo: ano corrente = mês de hoje; outro ano = último mês com receita (ou dezembro)", () => {
    expect(mesDoResumo(2026, LINHAS, new Date(2026, 8, 25))).toBe(8);
    expect(mesDoResumo(2025, LINHAS, new Date(2026, 8, 25))).toBe(8);
    expect(mesDoResumo(2025, [linha("receita_bruta", Array(12).fill(0))], new Date(2026, 8, 25))).toBe(11);
  });
});
