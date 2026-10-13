import { describe, expect, it } from "vitest";
import { intervaloNota, lerPeriodoNota, normalizarLinhaNota, ordenarPorNota, textoNota } from "./nota";
import { estadoJanela, horaOperacao, mensagemErroGarante, somarDias, textoMinutos, validarDiaSemOperacao, validarRegra } from "./regras";

describe("período da nota", () => {
  it("só 7 ou 30 dias; o resto vira 7", () => {
    expect(lerPeriodoNota("30")).toBe(30);
    expect(lerPeriodoNota("7")).toBe(7);
    expect(lerPeriodoNota("90")).toBe(7);
    expect(lerPeriodoNota(undefined)).toBe(7);
  });
  it("últimos N dias contando hoje no fuso de Brasília", () => {
    // 23h30 de 12/10 em Brasília = 02h30 UTC de 13/10.
    expect(intervaloNota(7, new Date("2026-10-13T02:30:00Z"))).toEqual({ de: "2026-10-06", ate: "2026-10-12" });
    expect(intervaloNota(30, new Date("2026-10-13T12:00:00Z"))).toEqual({ de: "2026-09-14", ate: "2026-10-13" });
  });
});

describe("textoNota", () => {
  it("arredonda para inteiro e mostra - sem dado", () => {
    expect(textoNota(55.6)).toBe("56");
    expect(textoNota(90.67)).toBe("91");
    expect(textoNota(0)).toBe("0");
    expect(textoNota(null)).toBe("-");
    expect(textoNota(undefined)).toBe("-");
  });
});

describe("normalizarLinhaNota", () => {
  it("numeric do banco (texto) vira número e nulo continua nulo", () => {
    expect(
      normalizarLinhaNota({
        nivel: "unidade",
        chave: "uni",
        previstas: 4,
        concluidas: 3,
        no_prazo: 2,
        pontualidade: "50.0",
        execucao: "66.7",
        qualidade: null,
        nota: "58.4",
        adesao: "75.0",
        versao_formula: 1,
      }),
    ).toEqual({ nivel: "unidade", chave: "uni", previstas: 4, concluidas: 3, noPrazo: 2, p: 50, e: 66.7, q: null, nota: 58.4, adesao: 75 });
  });
});

describe("ordenarPorNota", () => {
  it("pior nota primeiro, sem dado no fim", () => {
    const linhas = [
      { nome: "Ana", nota: 90 },
      { nome: "Bia", nota: null },
      { nome: "Caio", nota: 40 },
    ];
    expect(ordenarPorNota(linhas).map((l) => l.nome)).toEqual(["Caio", "Ana", "Bia"]);
  });
});

describe("janela do checklist", () => {
  const abre = "2026-10-13T11:00:00Z"; // 08:00 em Brasília
  const fecha = "2026-10-13T14:00:00Z"; // 11:00 em Brasília
  it("antes de abrir, aberta e fechada (limites inclusos, como no banco)", () => {
    expect(estadoJanela(abre, fecha, new Date("2026-10-13T10:59:00Z"))).toBe("antes");
    expect(estadoJanela(abre, fecha, new Date(abre))).toBe("aberta");
    expect(estadoJanela(abre, fecha, new Date(fecha))).toBe("aberta");
    expect(estadoJanela(abre, fecha, new Date("2026-10-13T14:00:01Z"))).toBe("fechada");
  });
  it("hora no fuso da operação, com a data quando muda de dia", () => {
    expect(horaOperacao(fecha, "2026-10-13")).toBe("11:00");
    expect(horaOperacao("2026-10-14T03:30:00Z", "2026-10-13")).toBe("14/10 00:30");
  });
  it("soma dias sem fuso, inclusive na virada do mês", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("minutos para gente", () => {
    expect(textoMinutos(120)).toBe("2 h");
    expect(textoMinutos(90)).toBe("1 h 30 min");
    expect(textoMinutos(45)).toBe("45 min");
  });
});

describe("validarRegra", () => {
  it("aceita os limites do banco", () => {
    expect(validarRegra({ antecedenciaMin: 0, atrasoMaxMin: 1440 })).toEqual({ ok: true, antecedenciaMin: 0, atrasoMaxMin: 1440 });
    expect(validarRegra({ antecedenciaMin: 720, atrasoMaxMin: 0 }).ok).toBe(true);
  });
  it("recusa vazio, fração e fora da faixa", () => {
    expect(validarRegra({ antecedenciaMin: null, atrasoMaxMin: 60 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: 721, atrasoMaxMin: 60 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: 120, atrasoMaxMin: 1441 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: 12.5, atrasoMaxMin: 60 }).ok).toBe(false);
    expect(validarRegra({ antecedenciaMin: -1, atrasoMaxMin: 60 }).ok).toBe(false);
  });
});

describe("validarDiaSemOperacao", () => {
  const hoje = "2026-10-13";
  it("só a partir de amanhã, com motivo", () => {
    expect(validarDiaSemOperacao({ data: "2026-10-14", motivo: " Feriado ", hoje })).toEqual({ ok: true, data: "2026-10-14", motivo: "Feriado" });
    expect(validarDiaSemOperacao({ data: "2026-10-13", motivo: "Feriado", hoje }).ok).toBe(false);
    expect(validarDiaSemOperacao({ data: "2026-10-12", motivo: "Feriado", hoje }).ok).toBe(false);
    expect(validarDiaSemOperacao({ data: "2026-10-14", motivo: "x", hoje }).ok).toBe(false);
    expect(validarDiaSemOperacao({ data: "14/10/2026", motivo: "Feriado", hoje }).ok).toBe(false);
  });
});

describe("mensagens novas do banco", () => {
  it("traduz janela, dia sem operação, regra e período", () => {
    expect(mensagemErroGarante("janela_ainda_nao_abriu")).toContain("ainda não abriu");
    expect(mensagemErroGarante("data_fora_da_janela")).toContain("já acabou");
    expect(mensagemErroGarante("unidade_fechada_nesta_data")).toContain("dia sem operação");
    expect(mensagemErroGarante("so_data_futura")).toContain("a partir de amanhã");
    expect(mensagemErroGarante("data_com_checklist")).toContain("checklist começado");
    expect(mensagemErroGarante("regra_invalida")).toContain("720");
    expect(mensagemErroGarante("motivo_obrigatorio")).toContain("motivo");
    expect(mensagemErroGarante("periodo_invalido")).toContain("93 dias");
  });
});
