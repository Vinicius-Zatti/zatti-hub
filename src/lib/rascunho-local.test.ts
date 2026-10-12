import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chaveRascunho,
  lerRascunho,
  lerRascunhoBruto,
  limparRascunho,
  limparTodosRascunhos,
  quandoFoiSalvo,
  salvarRascunho,
} from "@/lib/rascunho-local";

function armazenamentoEmMemoria() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() {
      return dados.size;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("rascunho local", () => {
  it("separa por usuário, unidade, data e setor", () => {
    const a = chaveRascunho("contagem", "user-1", "the-house-food-fun-belo-horizonte", "2026-10-11", "setor-1");
    const b = chaveRascunho("contagem", "user-1", "the-house-food-fun-belo-horizonte", "2026-10-11", "setor-2");
    const c = chaveRascunho("contagem", "user-1", "dom-quixote", "2026-10-11", "setor-1");
    const d = chaveRascunho("contagem", "user-2", "the-house-food-fun-belo-horizonte", "2026-10-11", "setor-1");
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it("limpa no Sair só os rascunhos do app", () => {
    const armazenamento = armazenamentoEmMemoria();
    armazenamento.setItem("outra-coisa", "x");
    vi.stubGlobal("window", { localStorage: armazenamento });
    salvarRascunho(chaveRascunho("contagem", "u1", "x", "d", "s"), { a: 1 });
    salvarRascunho(chaveRascunho("desempenho", "u1", "x", "d"), { a: 1 });
    limparTodosRascunhos();
    expect(armazenamento.length).toBe(1);
    expect(armazenamento.getItem("outra-coisa")).toBe("x");
  });

  it("guarda, lê e limpa", () => {
    vi.stubGlobal("window", { localStorage: armazenamentoEmMemoria() });
    const chave = chaveRascunho("contagem", "u", "2026-10-11", "s");
    expect(salvarRascunho(chave, { valores: { SKU1: "12" } })).toBe(true);
    const lido = lerRascunho<{ valores: Record<string, string> }>(chave);
    expect(lido?.valores).toEqual({ SKU1: "12" });
    expect(typeof lido?.salvoEm).toBe("string");
    expect(lerRascunhoBruto(chave)).not.toBeNull();
    limparRascunho(chave);
    expect(lerRascunho(chave)).toBeNull();
  });

  it("não quebra sem localStorage (modo privado, bloqueado)", () => {
    const quebrado = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    vi.stubGlobal("window", { localStorage: quebrado });
    expect(salvarRascunho("k", { a: 1 })).toBe(false);
    expect(lerRascunho("k")).toBeNull();
    expect(lerRascunhoBruto("k")).toBeNull();
    expect(() => limparRascunho("k")).not.toThrow();
  });

  it("ignora conteúdo corrompido", () => {
    const armazenamento = armazenamentoEmMemoria();
    armazenamento.setItem("k", "{nao e json");
    armazenamento.setItem("lista", "[1,2]");
    vi.stubGlobal("window", { localStorage: armazenamento });
    expect(lerRascunho("k")).toBeNull();
    expect(lerRascunho("lista")).toBeNull();
  });

  it("formata quando foi salvo", () => {
    expect(quandoFoiSalvo(new Date(2026, 9, 11, 12, 4).toISOString())).toBe("11/10 às 12:04");
    expect(quandoFoiSalvo("invalido")).toBe("");
  });
});
