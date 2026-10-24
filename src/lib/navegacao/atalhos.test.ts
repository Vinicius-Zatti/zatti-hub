import { describe, expect, it } from "vitest";
import { destinosVisiveis, escolherAtalhos } from "./atalhos";
import { ROTULO_CARDAPIO, ROTULO_VENDAS, montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";

const CHAVES: (keyof ContextoMenuRestaurante)[] = [
  "podeGerir",
  "consolidadoVendasHabilitado",
  "financeiroGerencialHabilitado",
  "fichasTecnicasHabilitado",
  "equipeHabilitado",
  "garanteHabilitado",
  "conciliacaoHabilitada",
];

const tudoLigado = Object.fromEntries(CHAVES.map((c) => [c, true])) as ContextoMenuRestaurante;

function atalhos(ctx: Partial<ContextoMenuRestaurante>) {
  return escolherAtalhos(montarMenuRestaurantePiloto({ ...tudoLigado, ...ctx }));
}

const rotulos = (ctx: Partial<ContextoMenuRestaurante>) => atalhos(ctx).map((a) => a.label);

function todosOsContextos(): ContextoMenuRestaurante[] {
  return Array.from({ length: 2 ** CHAVES.length }, (_, n) =>
    Object.fromEntries(CHAVES.map((chave, i) => [chave, Boolean(n & (1 << i))])) as ContextoMenuRestaurante,
  );
}

describe("barra inferior: Início, Estoque, Garante e Financeiro para todos os papéis", () => {
  it("gestão/master e operacional têm a mesma barra, Estoque abre a Visão geral", () => {
    for (const podeGerir of [true, false]) {
      expect(atalhos({ podeGerir }).map((a) => [a.label, a.href])).toEqual([
        ["Início", "/painel"],
        ["Estoque", "/estoque/visao-geral"],
        ["Garante", "/garante"],
        ["Financeiro", "/financeiro-gerencial/visao-geral"],
      ]);
    }
  });
});

describe("destino que a pessoa não tem: a vaga vai para Vendas, Cardápio e Equipe", () => {
  it("sem Garante: Vendas na vaga dele", () => {
    expect(rotulos({ garanteHabilitado: false })).toEqual(["Início", "Estoque", ROTULO_VENDAS, "Financeiro"]);
  });

  it("sem Financeiro: Vendas na vaga dele", () => {
    expect(rotulos({ financeiroGerencialHabilitado: false })).toEqual(["Início", "Estoque", "Garante", ROTULO_VENDAS]);
  });

  it("sem Garante e sem Financeiro: Vendas e Cardápio", () => {
    expect(rotulos({ garanteHabilitado: false, financeiroGerencialHabilitado: false })).toEqual([
      "Início",
      "Estoque",
      ROTULO_VENDAS,
      ROTULO_CARDAPIO,
    ]);
  });

  it("sem Garante, Financeiro e Vendas: Cardápio e Equipe (gestão)", () => {
    expect(
      rotulos({ garanteHabilitado: false, financeiroGerencialHabilitado: false, consolidadoVendasHabilitado: false }),
    ).toEqual(["Início", "Estoque", ROTULO_CARDAPIO, "Equipe"]);
  });

  it("operacional não tem Equipe: com tudo desligado fica Início e Estoque", () => {
    const desligado = {
      podeGerir: false,
      garanteHabilitado: false,
      financeiroGerencialHabilitado: false,
      consolidadoVendasHabilitado: false,
      fichasTecnicasHabilitado: false,
    };
    expect(rotulos(desligado)).toEqual(["Início", "Estoque"]);
    expect(rotulos({ ...desligado, fichasTecnicasHabilitado: true })).toEqual(["Início", "Estoque", ROTULO_CARDAPIO]);
  });
});

describe("nunca mostra destino que a pessoa não vê no menu", () => {
  it("em toda combinação de papel e flag: destino visível, sem repetir, Início e Estoque sempre", () => {
    for (const ctx of todosOsContextos()) {
      const menu = montarMenuRestaurantePiloto(ctx);
      const visiveis = destinosVisiveis(menu);
      const lista = escolherAtalhos(menu);
      expect(lista.length, JSON.stringify(ctx)).toBeGreaterThanOrEqual(2);
      expect(lista.length, JSON.stringify(ctx)).toBeLessThanOrEqual(4);
      expect(lista.slice(0, 2).map((a) => a.label)).toEqual(["Início", "Estoque"]);
      for (const atalho of lista) {
        expect(visiveis.has(atalho.href), `${atalho.href} ${JSON.stringify(ctx)}`).toBe(true);
        expect(atalho.sections).toBeUndefined();
      }
      expect(new Set(lista.map((a) => a.href)).size).toBe(lista.length);
    }
  });

  it("módulo 'em breve' não conta como destino visível", () => {
    const menu = montarMenuRestaurantePiloto({ ...tudoLigado, garanteHabilitado: false });
    expect(destinosVisiveis(menu).has("/garante")).toBe(false);
  });
});
