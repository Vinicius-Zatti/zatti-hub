import { describe, expect, it } from "vitest";
import { diasAteFim, faixaAssinatura, fimDaVigencia, hojeSP, linkRenovacao, marcoDoDia, situacaoAssinatura } from "./regras";

describe("vigência anual", () => {
  it("fim = dia do pagamento em SP + 12 meses", () => {
    // 23h30 de SP em 15/10 já é 16/10 em UTC: vale o dia de SP.
    expect(fimDaVigencia(new Date("2026-10-16T02:30:00Z"))).toBe("2027-10-15");
    expect(fimDaVigencia(new Date("2028-02-29T15:00:00Z"))).toBe("2029-03-01");
  });

  it("hoje no fuso de SP", () => {
    expect(hojeSP(new Date("2026-10-16T02:00:00Z"))).toBe("2026-10-15");
  });

  it("dias até o fim", () => {
    expect(diasAteFim("2026-10-20", "2026-10-15")).toBe(5);
    expect(diasAteFim("2026-10-15", "2026-10-15")).toBe(0);
    expect(diasAteFim("2026-10-10", "2026-10-15")).toBe(-5);
  });
});

describe("situação no app", () => {
  it("sem vigência nunca vence", () => {
    expect(situacaoAssinatura(null, "2030-01-01")).toEqual({ tipo: "sem_vigencia" });
  });
  it("em dia, vencendo, carência e bloqueada", () => {
    expect(situacaoAssinatura("2026-11-30", "2026-10-15").tipo).toBe("em_dia");
    expect(situacaoAssinatura("2026-10-22", "2026-10-15")).toEqual({ tipo: "vencendo", dias: 7 });
    expect(situacaoAssinatura("2026-10-15", "2026-10-15")).toEqual({ tipo: "vencendo", dias: 0 });
    expect(situacaoAssinatura("2026-10-14", "2026-10-15")).toEqual({ tipo: "carencia", diasParaTravar: 9 });
    expect(situacaoAssinatura("2026-10-06", "2026-10-15")).toEqual({ tipo: "carencia", diasParaTravar: 1 });
    expect(situacaoAssinatura("2026-10-05", "2026-10-15")).toEqual({ tipo: "bloqueada" });
  });
});

describe("marco do aviso no WhatsApp", () => {
  const fim = "2026-11-30";
  it("um marco por faixa", () => {
    expect(marcoDoDia(fim, "2026-11-01")).toBe("d30");
    expect(marcoDoDia(fim, "2026-10-31")).toBe("d30");
    expect(marcoDoDia(fim, "2026-11-22")).toBe("d30");
    expect(marcoDoDia(fim, "2026-11-23")).toBe("d7");
    expect(marcoDoDia(fim, "2026-11-28")).toBe("d7");
    expect(marcoDoDia(fim, "2026-11-29")).toBe("d1");
    expect(marcoDoDia(fim, "2026-11-30")).toBe("d0");
    expect(marcoDoDia(fim, "2026-12-03")).toBe("d0");
  });
  it("fora das faixas não avisa", () => {
    expect(marcoDoDia(fim, "2026-10-30")).toBeNull();
    expect(marcoDoDia(fim, "2026-12-04")).toBeNull();
  });
});

it("link de renovação leva só o token", () => {
  expect(linkRenovacao("abc_DEF-123")).toBe("https://zatticonsultoria.com.br/zatti-hub/renovar/?c=abc_DEF-123");
});

describe("faixa no app", () => {
  it("antes de vencer, só a gestão vê", () => {
    expect(faixaAssinatura({ tipo: "vencendo", dias: 5 }, true)).toEqual({ tom: "aviso", texto: "Sua assinatura do Zatti Hub vence em 5 dias.", botao: true });
    expect(faixaAssinatura({ tipo: "vencendo", dias: 0 }, true)?.texto).toBe("Sua assinatura do Zatti Hub vence hoje.");
    expect(faixaAssinatura({ tipo: "vencendo", dias: 5 }, false)).toBeNull();
  });
  it("na carência, todos veem; só a gestão tem o botão", () => {
    expect(faixaAssinatura({ tipo: "carencia", diasParaTravar: 8 }, true)).toEqual({ tom: "alerta", texto: "Sua assinatura venceu. Renove em até 8 dias para continuar usando.", botao: true });
    expect(faixaAssinatura({ tipo: "carencia", diasParaTravar: 1 }, true)?.texto).toBe("Sua assinatura venceu. Renove até amanhã para continuar usando.");
    expect(faixaAssinatura({ tipo: "carencia", diasParaTravar: 8 }, false)).toEqual({ tom: "alerta", texto: "A assinatura do Zatti Hub venceu. Avise a gestão: o app trava em 8 dias.", botao: false });
  });
  it("em dia ou sem vigência, nada", () => {
    expect(faixaAssinatura({ tipo: "em_dia", dias: 40 }, true)).toBeNull();
    expect(faixaAssinatura({ tipo: "sem_vigencia" }, true)).toBeNull();
  });
});
