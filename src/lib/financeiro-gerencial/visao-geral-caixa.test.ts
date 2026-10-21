import { describe, expect, it } from "vitest";
import { projetarCaixa, type TituloEmAberto } from "./visao-geral";

function titulo(over: Partial<TituloEmAberto> & { dataPrevista: string; tipo: TituloEmAberto["tipo"]; valorAberto: number }): TituloEmAberto {
  return { parcelaId: `p_${Math.random()}`, descricao: "teste", categoriaId: "c", parcela: "1/1", ...over };
}

// Alerta de caixa do Painel financeiro (20/10/2026).
describe("projetarCaixa", () => {
  it("acha o primeiro dia negativo e o menor saldo, dia a dia", () => {
    const caixa = projetarCaixa({
      hoje: "2026-10-20",
      saldoHoje: 1000,
      abertos: [
        titulo({ dataPrevista: "2026-10-22", tipo: "despesa", valorAberto: 1500 }),
        titulo({ dataPrevista: "2026-10-25", tipo: "receita", valorAberto: 800 }),
        titulo({ dataPrevista: "2026-10-28", tipo: "despesa", valorAberto: 600 }),
      ],
    });
    expect(caixa.primeiroNegativo).toEqual({ data: "2026-10-22", valor: -500 });
    expect(caixa.menorSaldo).toEqual({ data: "2026-10-22", valor: -500 });
    expect(caixa.saldoFinal).toEqual({ data: "2026-11-19", valor: -300 });
    expect(caixa.entradas).toBe(800);
    expect(caixa.saidas).toBe(2100);
  });

  it("a pagar vencido sai hoje; a receber vencido não entra", () => {
    const caixa = projetarCaixa({
      hoje: "2026-10-20",
      saldoHoje: 500,
      abertos: [
        titulo({ dataPrevista: "2026-10-10", tipo: "despesa", valorAberto: 700 }),
        titulo({ dataPrevista: "2026-10-05", tipo: "receita", valorAberto: 5000 }),
      ],
    });
    expect(caixa.vencidoAPagarHoje).toBe(700);
    expect(caixa.primeiroNegativo).toEqual({ data: "2026-10-20", valor: -200 });
    expect(caixa.entradas).toBe(0);
  });

  it("sem negativo no período: alerta nulo; vencimento depois do período não conta", () => {
    const caixa = projetarCaixa({
      hoje: "2026-10-20",
      saldoHoje: 100,
      abertos: [titulo({ dataPrevista: "2026-12-01", tipo: "despesa", valorAberto: 9999 })],
    });
    expect(caixa.primeiroNegativo).toBeNull();
    expect(caixa.saldoFinal.valor).toBe(100);
  });
});
