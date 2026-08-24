import { describe, expect, it } from "vitest";
import { somarMesesClampado, ultimoDiaDoMes } from "./datas";

describe("ultimoDiaDoMes", () => {
  it("fevereiro de ano comum tem 28 dias", () => {
    expect(ultimoDiaDoMes(2027, 1)).toBe(28);
  });

  it("fevereiro de ano bissexto tem 29 dias", () => {
    expect(ultimoDiaDoMes(2028, 1)).toBe(29);
  });

  it("meses de 31 dias", () => {
    expect(ultimoDiaDoMes(2026, 0)).toBe(31); // janeiro
  });
});

describe("somarMesesClampado", () => {
  it("mantém o mesmo dia quando o mês de destino tem esse dia", () => {
    expect(somarMesesClampado("2026-01-15", 1)).toBe("2026-02-15");
  });

  // Critério de aceite 3: despesa recorrente no dia 31 cai no último dia
  // válido de fevereiro.
  it("dia 31 de janeiro + 1 mês cai no último dia válido de fevereiro (ano comum)", () => {
    expect(somarMesesClampado("2027-01-31", 1)).toBe("2027-02-28");
  });

  it("dia 31 de janeiro + 1 mês cai no último dia válido de fevereiro (ano bissexto)", () => {
    expect(somarMesesClampado("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("dia 30 num mês de 31 dias funciona normalmente", () => {
    expect(somarMesesClampado("2026-01-30", 1)).toBe("2026-02-28");
  });

  it("depois do mês curto, volta a cair no dia 31 quando o mês seguinte permite", () => {
    // Janeiro 31 -> Fevereiro 28 -> Março deveria voltar pro dia 31 (a base
    // do cálculo é sempre a data original, não a data clampada do mês
    // anterior, senão a recorrência "murcha" pra sempre depois de fevereiro).
    expect(somarMesesClampado("2027-01-31", 2)).toBe("2027-03-31");
  });

  it("soma meses cruzando o fim do ano", () => {
    expect(somarMesesClampado("2026-11-15", 2)).toBe("2027-01-15");
  });
});
