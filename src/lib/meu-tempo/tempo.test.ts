import { describe, expect, it } from "vitest";
import {
  calcularDuracaoMinutosPorHorario,
  calcularDuracaoSegundosCronometro,
  formatarHorasMinutos,
  itemVigenteEm,
  montarPainelMensal,
  somarMinutos,
  ultimoDiaCompetencia,
} from "./tempo";

describe("formatarHorasMinutos", () => {
  it("formata horas e minutos com 2 dígitos", () => {
    expect(formatarHorasMinutos(125)).toBe("2h05");
  });

  it("minutos exatos em hora cheia mostram 00", () => {
    expect(formatarHorasMinutos(120)).toBe("2h00");
  });

  it("menos de 1 hora", () => {
    expect(formatarHorasMinutos(45)).toBe("0h45");
  });

  it("arredonda fração de minuto", () => {
    expect(formatarHorasMinutos(90.4)).toBe("1h30");
  });
});

describe("ultimoDiaCompetencia", () => {
  it("mês de 30 dias", () => {
    expect(ultimoDiaCompetencia("2026-09")).toBe("2026-09-30");
  });

  it("fevereiro bissexto", () => {
    expect(ultimoDiaCompetencia("2028-02")).toBe("2028-02-29");
  });
});

describe("itemVigenteEm", () => {
  const historicoDesc = [
    { vigenteDesde: "2026-09-01", valor: 150 },
    { vigenteDesde: "2026-01-01", valor: 139 },
  ];

  it("pega a linha mais recente que já valia na data", () => {
    expect(itemVigenteEm(historicoDesc, "2026-09-15")?.valor).toBe(150);
  });

  it("antes da 1ª linha valer, cai pra linha anterior no tempo", () => {
    expect(itemVigenteEm(historicoDesc, "2026-05-01")?.valor).toBe(139);
  });

  it("antes de qualquer linha valer, devolve null", () => {
    expect(itemVigenteEm(historicoDesc, "2025-01-01")).toBeNull();
  });
});

describe("calcularDuracaoMinutosPorHorario", () => {
  it("calcula a diferença em minutos", () => {
    expect(calcularDuracaoMinutosPorHorario("09:00", "10:30")).toBe(90);
  });

  it("fim antes do início é lido como virada de dia (madrugada)", () => {
    expect(calcularDuracaoMinutosPorHorario("23:00", "00:24")).toBe(84);
  });

  it("fim igual ao início dá 0 (validação de 'depois do início' fica pra quem chama)", () => {
    expect(calcularDuracaoMinutosPorHorario("10:00", "10:00")).toBe(0);
  });
});

describe("somarMinutos", () => {
  it("soma ignorando lançamento sem duração (cronômetro ainda ativo)", () => {
    expect(somarMinutos([{ duracaoMinutos: 30 }, { duracaoMinutos: null }, { duracaoMinutos: 45 }])).toBe(75);
  });
});

describe("calcularDuracaoSegundosCronometro", () => {
  it("desconta o tempo pausado", () => {
    const iniciadoEm = new Date("2026-09-03T10:00:00Z");
    const encerradoEm = new Date("2026-09-03T11:00:00Z");
    const segundos = calcularDuracaoSegundosCronometro({ iniciadoEm, encerradoEm, segundosPausadosAcumulados: 600 });
    expect(segundos).toBe(3000);
  });

  it("nunca fica negativo", () => {
    const iniciadoEm = new Date("2026-09-03T10:00:00Z");
    const encerradoEm = new Date("2026-09-03T10:00:05Z");
    const segundos = calcularDuracaoSegundosCronometro({ iniciadoEm, encerradoEm, segundosPausadosAcumulados: 999 });
    expect(segundos).toBe(0);
  });
});

describe("montarPainelMensal", () => {
  const frentes = [
    { id: "f-paga", nome: "Horizzon", tipo: "paga" as const, ativo: true },
    { id: "f-propria", nome: "Próprio - Verato", tipo: "propria" as const, ativo: true },
  ];
  const valoresHoraDesc = [{ id: "v1", valor: 139, vigenteDesde: "2026-01-01" }];

  it("frente paga com meta calcula meta em horas, restante e %", () => {
    const metasMensaisDesc = [{ id: "m1", frenteId: "f-paga", valorMensal: 7000, vigenteDesde: "2026-01-01" }];
    const lancamentos = [
      { frenteId: "f-paga", duracaoMinutos: 120 },
      { frenteId: "f-paga", duracaoMinutos: 60 },
    ] as never[];

    const linhas = montarPainelMensal({
      frentes,
      valoresHoraDesc,
      metasMensaisDesc,
      lancamentosEncerradosDoMes: lancamentos,
      competencia: "2026-09",
    });

    const linhaPaga = linhas.find((l) => l.frente.id === "f-paga")!;
    expect(linhaPaga.realizadoMinutos).toBe(180);
    // 7000 / 139 * 60 = 3021.58... -> arredonda pra 3022
    expect(linhaPaga.metaMinutos).toBe(3022);
    expect(linhaPaga.restanteMinutos).toBe(3022 - 180);
    expect(linhaPaga.percentualAtingido).toBeCloseTo(180 / 3022);
    expect(linhaPaga.valorEquivalente).toBeCloseTo((180 / 60) * 139);
  });

  it("frente própria nunca tem meta, %, restante ou valor equivalente", () => {
    const linhas = montarPainelMensal({
      frentes,
      valoresHoraDesc,
      metasMensaisDesc: [],
      lancamentosEncerradosDoMes: [{ frenteId: "f-propria", duracaoMinutos: 90 }] as never[],
      competencia: "2026-09",
    });

    const linhaPropria = linhas.find((l) => l.frente.id === "f-propria")!;
    expect(linhaPropria.realizadoMinutos).toBe(90);
    expect(linhaPropria.metaMinutos).toBeNull();
    expect(linhaPropria.percentualAtingido).toBeNull();
    expect(linhaPropria.valorEquivalente).toBeNull();
  });
});
