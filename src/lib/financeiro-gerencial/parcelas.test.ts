import { describe, expect, it } from "vitest";
import { calcularSaldoAberto, calcularStatusParcela, gerarParcelas, somarValores } from "./parcelas";

describe("gerarParcelas", () => {
  it("parcela única devolve o valor cheio na data informada", () => {
    const parcelas = gerarParcelas(500, 1, "2026-09-10");
    expect(parcelas).toEqual([{ numero: 1, totalParcelas: 1, valor: 500, dataPrevista: "2026-09-10" }]);
  });

  it("divide em parcelas mensais iguais quando o valor é exato", () => {
    const parcelas = gerarParcelas(300, 3, "2026-01-10");
    expect(parcelas.map((p) => p.valor)).toEqual([100, 100, 100]);
    expect(parcelas.map((p) => p.dataPrevista)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  // Critério de aceite 4: parcela com valor/data/status independentes -
  // aqui garante que a soma das parcelas sempre bate com o valor total,
  // mesmo quando a divisão não é exata (100/3 = 33,33...).
  it("joga o resto de arredondamento pra última parcela, soma bate com o total", () => {
    const parcelas = gerarParcelas(100, 3, "2026-01-05");
    expect(parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(somarValores(parcelas.map((p) => p.valor))).toBe(100);
  });

  it("cada parcela nasce numerada e sabe o total de parcelas", () => {
    const parcelas = gerarParcelas(200, 2, "2026-05-01");
    expect(parcelas[0]).toMatchObject({ numero: 1, totalParcelas: 2 });
    expect(parcelas[1]).toMatchObject({ numero: 2, totalParcelas: 2 });
  });

  it("rejeita menos de 1 parcela", () => {
    expect(() => gerarParcelas(100, 0, "2026-01-01")).toThrow();
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
