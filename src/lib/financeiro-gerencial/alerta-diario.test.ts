import { describe, expect, it } from "vitest";
import { ehSegunda, montarAlertaDiario, type ResumoAlerta } from "./alerta-diario";

const base: ResumoAlerta = {
  nomeDestinatario: "Vinícius Zanetti",
  unidadeNome: "Zatti Burger",
  data: "2026-10-13",
  vencendoHoje: [],
  vencidas: { quantidade: 0, totalCentavos: 0, maisAntiga: null },
  movimentosParados: 0,
  mesAnteriorAberto: null,
};

describe("alerta diário de contas a pagar", () => {
  it("lista as contas do dia numeradas, com total", () => {
    const texto = montarAlertaDiario({
      ...base,
      vencendoHoje: [
        { contraparte: "Bemdita Carnes", descricao: "Carnes da semana", numero: "123", saldoCentavos: 200000 },
        { contraparte: null, descricao: "Aluguel", numero: null, saldoCentavos: 350000 },
      ],
    });
    expect(texto).toContain("Oi Vinícius, hoje (13/10) temos estas contas vencendo na Zatti Burger:");
    expect(texto).toContain("1) Bemdita Carnes - NF 123 - Carnes da semana - R$");
    expect(texto).toContain("2) Aluguel - R$");
    expect(texto).toMatch(/Total de hoje: R\$\s5\.500,00\./);
    expect(texto).not.toMatch(/—/);
  });
  it("sem nada no dia não manda, a não ser vencidas numa segunda", () => {
    expect(montarAlertaDiario(base)).toBeNull();
    const vencidas = { quantidade: 2, totalCentavos: 9000, maisAntiga: "2026-10-01" };
    expect(montarAlertaDiario({ ...base, vencidas })).toBeNull();
    const segunda = montarAlertaDiario({ ...base, data: "2026-10-12", vencidas });
    expect(segunda).toContain("não vence nenhuma conta");
    expect(segunda).toContain("2 contas vencidas");
    expect(segunda).toContain("01/10/2026");
  });
  it("avisa conciliação parada e mês aberto", () => {
    const texto = montarAlertaDiario({
      ...base,
      vencendoHoje: [{ contraparte: "Coca", descricao: "Bebidas", numero: null, saldoCentavos: 100 }],
      movimentosParados: 5,
      mesAnteriorAberto: "09/2026",
    });
    expect(texto).toContain("5 movimentos do extrato");
    expect(texto).toContain("O mês 09/2026 ainda não foi fechado.");
  });
  it("reconhece segunda-feira", () => {
    expect(ehSegunda("2026-10-12")).toBe(true);
    expect(ehSegunda("2026-10-13")).toBe(false);
  });
});
