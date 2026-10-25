import { describe, expect, it } from "vitest";
import {
  CHAVE_TEMA_ATUAL,
  SCRIPT_TEMA_INICIAL,
  chavePreferenciaUsuario,
  lerPreferencia,
  resolverTema,
} from "./tema";

function rodarScript(salvo: string | null, sistemaEscuro: boolean, localStorageQuebrado = false) {
  const atributos: Record<string, string> = {};
  const documento = { documentElement: { setAttribute: (nome: string, valor: string) => (atributos[nome] = valor) } };
  const armazenamento = {
    getItem: (chave: string) => {
      if (localStorageQuebrado) throw new Error("bloqueado");
      return chave === CHAVE_TEMA_ATUAL ? salvo : null;
    },
  };
  const janela = { matchMedia: () => ({ matches: sistemaEscuro }) };
  new Function("document", "localStorage", "window", SCRIPT_TEMA_INICIAL)(documento, armazenamento, janela);
  return atributos["data-tema"];
}

describe("tema", () => {
  it("lê só as três preferências válidas", () => {
    expect(lerPreferencia("claro")).toBe("claro");
    expect(lerPreferencia("escuro")).toBe("escuro");
    expect(lerPreferencia("automatico")).toBe("automatico");
    expect(lerPreferencia("dark")).toBeNull();
    expect(lerPreferencia(null)).toBeNull();
  });

  it("automático segue o aparelho; claro e escuro ignoram", () => {
    expect(resolverTema("automatico", true)).toBe("escuro");
    expect(resolverTema("automatico", false)).toBe("claro");
    expect(resolverTema("claro", true)).toBe("claro");
    expect(resolverTema("escuro", false)).toBe("escuro");
  });

  it("chave por usuário não leva o e-mail em texto e ignora maiúsculas", () => {
    const chave = chavePreferenciaUsuario("Gestor@Exemplo.com");
    expect(chave).toBe(chavePreferenciaUsuario("gestor@exemplo.com"));
    expect(chave).not.toContain("exemplo");
    expect(chave.startsWith(`${CHAVE_TEMA_ATUAL}:`)).toBe(true);
    expect(chave).not.toBe(chavePreferenciaUsuario("outra@exemplo.com"));
  });

  it("script do <head> aplica o tema salvo antes da pintura", () => {
    expect(rodarScript("escuro", false)).toBe("escuro");
    expect(rodarScript("claro", true)).toBe("claro");
    expect(rodarScript("automatico", true)).toBe("escuro");
    expect(rodarScript("automatico", false)).toBe("claro");
  });

  it("sem escolha, valor estranho ou localStorage bloqueado fica claro", () => {
    expect(rodarScript(null, true)).toBe("claro");
    expect(rodarScript("dark", true)).toBe("claro");
    expect(rodarScript("escuro", true, true)).toBe("claro");
  });
});
