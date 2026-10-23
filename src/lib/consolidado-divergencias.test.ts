import { describe, expect, it } from "vitest";
import { divergenciasDoAviso, janelaAvisoDivergencia } from "./consolidado-divergencias";

const l = (data: string, status: "conferido" | "divergente" = "divergente") => ({ data, status });

describe("janelaAvisoDivergencia", () => {
  it("mês anterior aberto: entra no aviso junto com o atual", () => {
    expect(janelaAvisoDivergencia("2026-10-23", new Set())).toEqual({ de: "2026-09-01", ate: "2026-10-31" });
  });

  it("mês anterior fechado: só o mês atual", () => {
    expect(janelaAvisoDivergencia("2026-10-23", new Set(["2026-09"]))).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
  });

  it("fechamento de mês mais antigo não muda nada", () => {
    expect(janelaAvisoDivergencia("2026-10-23", new Set(["2026-08"]))).toEqual({ de: "2026-09-01", ate: "2026-10-31" });
  });

  it("virada de mês com anterior aberto: dia 1 já mostra o mês que acabou", () => {
    expect(janelaAvisoDivergencia("2026-11-01", new Set(["2026-09"]))).toEqual({ de: "2026-10-01", ate: "2026-11-30" });
  });

  it("virada de mês com anterior fechado: setembro sai mesmo aberto", () => {
    expect(janelaAvisoDivergencia("2026-11-01", new Set(["2026-10"]))).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
  });

  it("virada de ano: janeiro olha dezembro do ano anterior", () => {
    expect(janelaAvisoDivergencia("2027-01-05", new Set())).toEqual({ de: "2026-12-01", ate: "2027-01-31" });
    expect(janelaAvisoDivergencia("2027-01-05", new Set(["2026-12"]))).toEqual({ de: "2027-01-01", ate: "2027-01-31" });
  });

  it("fevereiro bissexto termina no dia 29", () => {
    expect(janelaAvisoDivergencia("2028-02-10", new Set(["2028-01"])).ate).toBe("2028-02-29");
  });
});

describe("divergenciasDoAviso", () => {
  const lancamentos = [
    l("2026-08-30"),
    l("2026-09-05"),
    l("2026-09-30"),
    l("2026-10-02", "conferido"),
    l("2026-10-03"),
  ];

  it("caso Dom Quixote: divergências antigas não entram quando o anterior fecha", () => {
    expect(divergenciasDoAviso(lancamentos, janelaAvisoDivergencia("2026-10-23", new Set(["2026-09"])))).toEqual([l("2026-10-03")]);
  });

  it("anterior aberto: conta setembro e outubro, nunca agosto nem conferido", () => {
    expect(divergenciasDoAviso(lancamentos, janelaAvisoDivergencia("2026-10-23", new Set())).map((x) => x.data)).toEqual([
      "2026-09-05",
      "2026-09-30",
      "2026-10-03",
    ]);
  });
});
