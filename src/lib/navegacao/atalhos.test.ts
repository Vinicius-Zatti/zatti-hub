import { describe, expect, it } from "vitest";
import { destinosVisiveis, escolherAtalhos } from "./atalhos";
import { montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";
import { itemAtivo } from "./tipos";

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
  const completo = { ...tudoLigado, ...ctx };
  return escolherAtalhos(montarMenuRestaurantePiloto(completo), completo.podeGerir);
}

function todosOsContextos(): ContextoMenuRestaurante[] {
  return Array.from({ length: 2 ** CHAVES.length }, (_, n) =>
    Object.fromEntries(CHAVES.map((chave, i) => [chave, Boolean(n & (1 << i))])) as ContextoMenuRestaurante,
  );
}

describe("atalhos da barra inferior por papel", () => {
  it("operacional: Início, Contagem, Pedidos e Garante", () => {
    expect(atalhos({ podeGerir: false }).map((a) => [a.label, a.href])).toEqual([
      ["Início", "/painel"],
      ["Contagem", "/estoque/contagem"],
      ["Pedidos", "/estoque/pedidos/feitos"],
      ["Garante", "/garante"],
    ]);
  });

  it("gestão e master (podeGerir): Início, Estoque, Financeiro e Desempenho", () => {
    expect(atalhos({ podeGerir: true }).map((a) => [a.label, a.href])).toEqual([
      ["Início", "/painel"],
      ["Estoque", "/estoque/produtos"],
      ["Financeiro", "/financeiro-gerencial/visao-geral"],
      ["Desempenho", "/financeiro/consolidado/novo"],
    ]);
  });
});

describe("módulo desligado sai e o próximo ocupa a vaga", () => {
  it("operacional sem Garante ganha Desempenho", () => {
    expect(atalhos({ podeGerir: false, garanteHabilitado: false }).map((a) => a.label)).toEqual([
      "Início",
      "Contagem",
      "Pedidos",
      "Desempenho",
    ]);
  });

  it("operacional sem Garante e sem Desempenho ganha Financeiro", () => {
    expect(
      atalhos({ podeGerir: false, garanteHabilitado: false, consolidadoVendasHabilitado: false }).map((a) => a.label),
    ).toEqual(["Início", "Contagem", "Pedidos", "Financeiro"]);
  });

  it("operacional com tudo desligado cai em Produtos", () => {
    const desligado = {
      podeGerir: false,
      garanteHabilitado: false,
      consolidadoVendasHabilitado: false,
      financeiroGerencialHabilitado: false,
      fichasTecnicasHabilitado: false,
    };
    expect(atalhos(desligado).map((a) => a.label)).toEqual(["Início", "Contagem", "Pedidos", "Produtos"]);
  });

  it("gestão sem Financeiro ganha Garante; sem Financeiro e Desempenho, Garante e Precificação", () => {
    expect(atalhos({ financeiroGerencialHabilitado: false }).map((a) => a.label)).toEqual([
      "Início",
      "Estoque",
      "Desempenho",
      "Garante",
    ]);
    expect(
      atalhos({ financeiroGerencialHabilitado: false, consolidadoVendasHabilitado: false }).map((a) => a.label),
    ).toEqual(["Início", "Estoque", "Garante", "Precificação"]);
  });

  it("gestão com todos os módulos de flag desligados completa com Contagem e Pedidos", () => {
    const desligado = {
      consolidadoVendasHabilitado: false,
      financeiroGerencialHabilitado: false,
      fichasTecnicasHabilitado: false,
      equipeHabilitado: false,
      garanteHabilitado: false,
    };
    expect(atalhos(desligado).map((a) => a.label)).toEqual(["Início", "Estoque", "Contagem", "Pedidos"]);
  });
});

describe("nunca mostra destino que a pessoa não vê no menu", () => {
  it("em toda combinação de papel e flag, todo atalho é destino visível do menu, sem repetir", () => {
    for (const ctx of todosOsContextos()) {
      const menu = montarMenuRestaurantePiloto(ctx);
      const visiveis = destinosVisiveis(menu);
      const lista = escolherAtalhos(menu, ctx.podeGerir);
      expect(lista.length, JSON.stringify(ctx)).toBe(4);
      for (const atalho of lista) expect(visiveis.has(atalho.href), `${atalho.href} ${JSON.stringify(ctx)}`).toBe(true);
      expect(new Set(lista.map((a) => a.href)).size).toBe(lista.length);
    }
  });

  it("módulo 'em breve' não conta como destino visível", () => {
    const menu = montarMenuRestaurantePiloto({ ...tudoLigado, garanteHabilitado: false });
    expect(destinosVisiveis(menu).has("/garante")).toBe(false);
    expect(destinosVisiveis(menu).has("#")).toBe(false);
  });
});

describe("ativo da barra usa a mesma regra do menu (prefixo mais longo)", () => {
  it("operacional", () => {
    const lista = atalhos({ podeGerir: false });
    expect(itemAtivo(lista, "/painel")).toBe("Início");
    expect(itemAtivo(lista, "/estoque/contagem/perdas")).toBe("Contagem");
    expect(itemAtivo(lista, "/estoque/pedidos/feitos")).toBe("Pedidos");
    expect(itemAtivo(lista, "/garante/execucao/abc")).toBe("Garante");
    expect(itemAtivo(lista, "/estoque/produtos")).toBeUndefined();
  });

  it("gestão: Desempenho não acende no Financeiro gerencial", () => {
    const lista = atalhos({ podeGerir: true });
    expect(itemAtivo(lista, "/estoque/contagem")).toBe("Estoque");
    expect(itemAtivo(lista, "/estoque/fornecedores/edicao")).toBe("Estoque");
    expect(itemAtivo(lista, "/financeiro-gerencial/dre")).toBe("Financeiro");
    expect(itemAtivo(lista, "/financeiro/consolidado")).toBe("Desempenho");
    expect(itemAtivo(lista, "/garante")).toBeUndefined();
  });
});
