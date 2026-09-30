import { describe, expect, it } from "vitest";
import { ehTitularFinanceiro, RESTRICAO_FINANCEIRO_ATIVA, TITULARES_FINANCEIRO } from "./acesso-financeiro";

describe("Financeiro só para Vinícius (29/09/2026)", () => {
  it("a restrição está ligada", () => {
    expect(RESTRICAO_FINANCEIRO_ATIVA).toBe(true);
  });

  it("Vinícius master com segundo fator acessa, pelos dois e-mails", () => {
    for (const email of TITULARES_FINANCEIRO) {
      expect(ehTitularFinanceiro({ ehMaster: true, aal: "aal2", email })).toBe(true);
    }
    expect(ehTitularFinanceiro({ ehMaster: true, aal: "aal2", email: " ConsultoriaZatti@gmail.com " })).toBe(true);
  });

  it("Vinícius sem segundo fator ou sem vínculo master não acessa", () => {
    expect(ehTitularFinanceiro({ ehMaster: true, aal: "aal1", email: TITULARES_FINANCEIRO[0] })).toBe(false);
    expect(ehTitularFinanceiro({ ehMaster: false, aal: "aal2", email: TITULARES_FINANCEIRO[0] })).toBe(false);
  });

  it("outro master, Gestão e Operacional não acessam", () => {
    expect(ehTitularFinanceiro({ ehMaster: true, aal: "aal2", email: "outro.master@exemplo.com" })).toBe(false);
    expect(ehTitularFinanceiro({ ehMaster: false, aal: "aal1", email: "gestao@exemplo.com" })).toBe(false);
    expect(ehTitularFinanceiro({ ehMaster: false, aal: "aal1", email: "" })).toBe(false);
  });
});
