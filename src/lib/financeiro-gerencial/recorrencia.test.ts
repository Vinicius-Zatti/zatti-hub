import { describe, expect, it } from "vitest";
import { MAXIMO_OCORRENCIAS_RECORRENCIA, gerarOcorrenciasRecorrencia } from "./recorrencia";

describe("gerarOcorrenciasRecorrencia", () => {
  it("início no dia do vencimento gera a 1ª ocorrência no mesmo mês", () => {
    const datas = gerarOcorrenciasRecorrencia({
      diaVencimento: 5,
      dataInicio: "2026-03-01",
      fim: { modo: "quantidade", quantidadeOcorrencias: 3 },
    });
    expect(datas).toEqual(["2026-03-05", "2026-04-05", "2026-05-05"]);
  });

  it("quando o vencimento do mês de início já passou, começa no mês seguinte", () => {
    const datas = gerarOcorrenciasRecorrencia({
      diaVencimento: 5,
      dataInicio: "2026-03-15",
      fim: { modo: "quantidade", quantidadeOcorrencias: 2 },
    });
    expect(datas).toEqual(["2026-04-05", "2026-05-05"]);
  });

  // Mesma regra já aprovada de `somarMesesClampado`/`datas.test.ts`: dia 31
  // cai no último dia válido de fevereiro e volta a 31 em março - nunca
  // "murcha" pra sempre depois de um mês curto.
  it("dia 31 cai no último dia válido de fevereiro e volta a 31 em março", () => {
    const datas = gerarOcorrenciasRecorrencia({
      diaVencimento: 31,
      dataInicio: "2027-01-01",
      fim: { modo: "quantidade", quantidadeOcorrencias: 3 },
    });
    expect(datas).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("respeita data final em vez de quantidade", () => {
    const datas = gerarOcorrenciasRecorrencia({
      diaVencimento: 10,
      dataInicio: "2026-01-01",
      fim: { modo: "data", dataFim: "2026-03-31" },
    });
    expect(datas).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  it("rejeita data final anterior à primeira ocorrência", () => {
    expect(() =>
      gerarOcorrenciasRecorrencia({
        diaVencimento: 20,
        dataInicio: "2026-05-25",
        fim: { modo: "data", dataFim: "2026-06-01" },
      }),
    ).toThrow();
  });

  it("rejeita quantidade acima do teto", () => {
    expect(() =>
      gerarOcorrenciasRecorrencia({
        diaVencimento: 5,
        dataInicio: "2026-01-01",
        fim: { modo: "quantidade", quantidadeOcorrencias: MAXIMO_OCORRENCIAS_RECORRENCIA + 1 },
      }),
    ).toThrow();
  });

  it("rejeita período que exigiria mais ocorrências que o teto", () => {
    expect(() =>
      gerarOcorrenciasRecorrencia({
        diaVencimento: 5,
        dataInicio: "2026-01-01",
        fim: { modo: "data", dataFim: "2100-01-01" },
      }),
    ).toThrow();
  });
});
