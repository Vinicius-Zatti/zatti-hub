import { describe, expect, it } from "vitest";
import {
  montarMenuRestaurante,
  montarMenuRestaurantePiloto,
  type ContextoMenuRestaurante,
} from "./menu-restaurante";
import { itemAtivo, subitemAtivo, type ItemNavegacao } from "./tipos";

const CHAVES: (keyof ContextoMenuRestaurante)[] = [
  "podeGerir",
  "consolidadoVendasHabilitado",
  "financeiroGerencialHabilitado",
  "fichasTecnicasHabilitado",
  "equipeHabilitado",
  "garanteHabilitado",
  "conciliacaoHabilitada",
];

/** Todas as 128 combinações de papel (gestão/master x operacional) e flags. */
function todosOsContextos(): ContextoMenuRestaurante[] {
  return Array.from({ length: 2 ** CHAVES.length }, (_, n) =>
    Object.fromEntries(CHAVES.map((chave, i) => [chave, Boolean(n & (1 << i))])) as ContextoMenuRestaurante,
  );
}

/** Cada destino do menu com o estado do módulo que o leva ("em breve" ou não). */
function destinos(itens: ItemNavegacao[]): string[] {
  return itens
    .flatMap((item) =>
      item.sections
        ? item.sections.flatMap((s) => s.items.map((i) => `${i.href}|${item.disabled}`))
        : [`${item.href}|${item.disabled}`],
    )
    .sort();
}

const tudoLigado: ContextoMenuRestaurante = Object.fromEntries(CHAVES.map((c) => [c, true])) as ContextoMenuRestaurante;

describe("menu do piloto x menu atual", () => {
  it("mesmos destinos e mesmo 'em breve' em toda combinação de papel e flag", () => {
    for (const ctx of todosOsContextos()) {
      expect(destinos(montarMenuRestaurantePiloto(ctx)), JSON.stringify(ctx)).toEqual(
        destinos(montarMenuRestaurante(ctx)),
      );
    }
  });

  it("menu atual não mudou de forma (módulos e ordem)", () => {
    expect(montarMenuRestaurante(tudoLigado).map((i) => i.label)).toEqual([
      "Painel geral",
      "Estoque",
      "Desempenho",
      "Financeiro",
      "Precificação",
      "Equipe",
      "Checklist Garante",
      "Marketing",
    ]);
    expect(montarMenuRestaurante(tudoLigado)[1].sections?.map((s) => s.label)).toEqual([
      "Produtos",
      "Contagem",
      "Pedidos",
      "Fornecedores",
      "CMV Real",
    ]);
  });

  it("piloto agrupa Início, Cadastros e Estoque e mantém os demais módulos", () => {
    const piloto = montarMenuRestaurantePiloto(tudoLigado);
    expect(piloto.map((i) => i.label)).toEqual([
      "Início",
      "Cadastros",
      "Estoque",
      "Desempenho",
      "Financeiro",
      "Precificação",
      "Equipe",
      "Checklist Garante",
      "Marketing",
    ]);
    expect(piloto[1].sections?.map((s) => s.label)).toEqual(["Produtos", "Setores", "Fornecedores"]);
    expect(piloto[2].sections?.map((s) => s.label)).toEqual(["Contagem", "Pedidos", "CMV Real"]);
  });

  it("gestão e master (podeGerir) veem o mesmo; operacional não vê Setores, Fornecedores, CMV e Equipe", () => {
    const operacional = montarMenuRestaurantePiloto({ ...tudoLigado, podeGerir: false });
    expect(operacional.map((i) => i.label)).not.toContain("Equipe");
    expect(operacional[1].sections?.map((s) => s.label)).toEqual(["Produtos"]);
    expect(operacional[2].sections?.map((s) => s.label)).toEqual(["Contagem", "Pedidos"]);
  });
});

describe("item e subitem ativos no menu do piloto", () => {
  const piloto = montarMenuRestaurantePiloto(tudoLigado);

  it("tela de cadastro abre Cadastros; rotina de estoque abre Estoque", () => {
    expect(itemAtivo(piloto, "/estoque/produtos/edicao")).toBe("Cadastros");
    expect(itemAtivo(piloto, "/estoque/setores")).toBe("Cadastros");
    expect(itemAtivo(piloto, "/estoque/fornecedores/novo")).toBe("Cadastros");
    expect(itemAtivo(piloto, "/estoque/contagem/perdas")).toBe("Estoque");
    expect(itemAtivo(piloto, "/estoque/cmv")).toBe("Estoque");
    expect(itemAtivo(piloto, "/painel")).toBe("Início");
    expect(itemAtivo(piloto, "/financeiro-gerencial/dre")).toBe("Financeiro");
    expect(itemAtivo(piloto, "/financeiro/consolidado")).toBe("Desempenho");
  });

  it("subitem ativo é o mais específico, inclusive em tela de detalhe", () => {
    expect(subitemAtivo(piloto, "/financeiro/consolidado/novo")).toBe("/financeiro/consolidado/novo");
    expect(subitemAtivo(piloto, "/financeiro/consolidado")).toBe("/financeiro/consolidado");
    expect(subitemAtivo(piloto, "/estoque/pedidos/feitos")).toBe("/estoque/pedidos/feitos");
    expect(subitemAtivo(piloto, "/estoque/fornecedores/novo")).toBe("/estoque/fornecedores");
    expect(subitemAtivo(piloto, "/estoque/produtos-x")).toBeUndefined();
  });
});
