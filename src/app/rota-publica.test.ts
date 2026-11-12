import { describe, expect, it } from "vitest";
import { ehRotaPublica } from "../../middleware";

describe("ehRotaPublica", () => {
  it("libera a rota e o que fica embaixo dela", () => {
    expect(ehRotaPublica("/login")).toBe(true);
    expect(ehRotaPublica("/auth/callback")).toBe(true);
    expect(ehRotaPublica("/primeiro-acesso/confirmar")).toBe(true);
    expect(ehRotaPublica("/api/equipe/acesso")).toBe(true);
    expect(ehRotaPublica("/avaliar/dom-quixote/salao")).toBe(true);
    expect(ehRotaPublica("/api/avaliacoes/alertas")).toBe(true);
  });

  it("não libera nome que só começa igual", () => {
    expect(ehRotaPublica("/login-admin")).toBe(false);
    expect(ehRotaPublica("/sem-acesso-total")).toBe(false);
    expect(ehRotaPublica("/api/equipe/acesso/outra")).toBe(false);
    expect(ehRotaPublica("/financeiro")).toBe(false);
    expect(ehRotaPublica("/avaliacoes")).toBe(false);
    expect(ehRotaPublica("/avaliacoes/configurar")).toBe(false);
  });
});
