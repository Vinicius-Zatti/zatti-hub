import { describe, expect, it } from "vitest";
import { calcularSaldoAberto, calcularStatusParcela, numerarParcelasManuais } from "./parcelas";

describe("numerarParcelasManuais", () => {
  it("uma linha só vira parcela única (1/1)", () => {
    const parcelas = numerarParcelasManuais([{ valor: 500, dataPrevista: "2026-09-10" }]);
    expect(parcelas).toEqual([{ numero: 1, totalParcelas: 1, valor: 500, dataPrevista: "2026-09-10" }]);
  });

  it("preserva valor e data próprios de cada linha, sem dividir nada", () => {
    const parcelas = numerarParcelasManuais([
      { valor: 100, dataPrevista: "2026-01-10" },
      { valor: 250.5, dataPrevista: "2026-03-01" },
    ]);
    expect(parcelas.map((p) => p.valor)).toEqual([100, 250.5]);
    expect(parcelas.map((p) => p.dataPrevista)).toEqual(["2026-01-10", "2026-03-01"]);
  });

  it("cada parcela nasce numerada e sabe o total de parcelas", () => {
    const parcelas = numerarParcelasManuais([
      { valor: 100, dataPrevista: "2026-05-01" },
      { valor: 100, dataPrevista: "2026-06-01" },
    ]);
    expect(parcelas[0]).toMatchObject({ numero: 1, totalParcelas: 2 });
    expect(parcelas[1]).toMatchObject({ numero: 2, totalParcelas: 2 });
  });
});

describe("calcularStatusParcela", () => {
  it("sem baixa nenhuma fica aberto", () => {
    expect(calcularStatusParcela(500, 0)).toBe("aberto");
  });

  it("baixa parcial fica parcial", () => {
    expect(calcularStatusParcela(500, 200)).toBe("parcial");
  });

  it("baixa igual ao valor da parcela fica quitado", () => {
    expect(calcularStatusParcela(500, 500)).toBe("quitado");
  });

  it("não sofre erro de ponto flutuante (0.1 + 0.2)", () => {
    expect(calcularStatusParcela(0.3, 0.1 + 0.2)).toBe("quitado");
  });
});

describe("calcularSaldoAberto", () => {
  it("sem baixa, saldo aberto é o valor cheio", () => {
    expect(calcularSaldoAberto(500, 0)).toBe(500);
  });

  it("com baixa parcial, saldo aberto é a diferença", () => {
    expect(calcularSaldoAberto(500, 200)).toBe(300);
  });

  it("nunca fica negativo mesmo com baixa maior que a parcela", () => {
    expect(calcularSaldoAberto(500, 600)).toBe(0);
  });
});
