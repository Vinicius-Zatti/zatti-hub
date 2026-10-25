import { describe, expect, it } from "vitest";
import { CATALOGO_ACOES, acoesDisponiveis, acoesDoInicio } from "./acoes";
import { destinosVisiveis } from "./atalhos";
import { montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";

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

function todosOsContextos(): ContextoMenuRestaurante[] {
  return Array.from({ length: 2 ** CHAVES.length }, (_, n) =>
    Object.fromEntries(CHAVES.map((chave, i) => [chave, Boolean(n & (1 << i))])) as ContextoMenuRestaurante,
  );
}

function titulos(ctx: Partial<ContextoMenuRestaurante>) {
  const completo = { ...tudoLigado, ...ctx };
  return acoesDisponiveis(montarMenuRestaurantePiloto(completo), completo.podeGerir).map((a) => a.titulo);
}

describe("atalhos de ação por papel", () => {
  it("gestão/master com tudo ligado: todos os atalhos do catálogo", () => {
    expect(titulos({})).toEqual(CATALOGO_ACOES.map((a) => a.titulo));
  });

  it("operacional: só ações da operação, sem cotação, CMV, Quadro, ficha nova, contas e Dashboard", () => {
    expect(titulos({ podeGerir: false })).toEqual([
      "Fazer contagem",
      "Garante do dia",
      "Lançar vendas do dia",
      "Receber pedido",
      "Nova despesa",
      "Nova receita",
    ]);
  });

  it("flag desligada tira o atalho do módulo", () => {
    expect(titulos({ garanteHabilitado: false })).not.toContain("Garante do dia");
    expect(titulos({ garanteHabilitado: false })).not.toContain("Quadro do Garante");
    expect(titulos({ financeiroGerencialHabilitado: false })).not.toContain("Nova despesa");
    expect(titulos({ consolidadoVendasHabilitado: false })).not.toContain("Lançar vendas do dia");
    expect(titulos({ fichasTecnicasHabilitado: false })).not.toContain("Nova ficha técnica");
  });

  it("em toda combinação: o destino do atalho está no menu da pessoa e os de gestão nunca vão ao operacional", () => {
    for (const ctx of todosOsContextos()) {
      const menu = montarMenuRestaurantePiloto(ctx);
      const visiveis = destinosVisiveis(menu);
      for (const acao of acoesDisponiveis(menu, ctx.podeGerir)) {
        expect(visiveis.has(acao.href.split("?")[0]), `${acao.titulo} ${JSON.stringify(ctx)}`).toBe(true);
        if (!ctx.podeGerir) expect(acao.soGestao ?? false).toBe(false);
      }
      const { operacao, gestao } = acoesDoInicio(menu, ctx.podeGerir);
      expect(operacao.every((a) => a.grupo === "operacao")).toBe(true);
      if (!ctx.podeGerir) expect(gestao).toEqual([]);
    }
  });

  it("Início: operacional vê só a operação do dia; gestão vê também a seção Gestão", () => {
    const operacional = acoesDoInicio(montarMenuRestaurantePiloto({ ...tudoLigado, podeGerir: false }), false);
    expect(operacional.gestao).toEqual([]);
    expect(operacional.operacao.map((a) => a.titulo)).toContain("Fazer contagem");

    const gestao = acoesDoInicio(montarMenuRestaurantePiloto(tudoLigado), true);
    expect(gestao.gestao.map((a) => a.titulo)).toEqual([
      "Criar cotação",
      "Quadro do Garante",
      "Contas a pagar e receber",
      "Nova ficha técnica",
      "Calcular CMV Real",
      "Dashboard",
    ]);
  });

  it("soGestao corta mesmo quando a tela está no menu de todos", () => {
    const menuOperacional = montarMenuRestaurantePiloto({ ...tudoLigado, podeGerir: false });
    // Fichas técnicas e Contas a pagar e receber estão no menu do operacional...
    expect(destinosVisiveis(menuOperacional).has("/fichas-tecnicas")).toBe(true);
    expect(destinosVisiveis(menuOperacional).has("/financeiro-gerencial/contas-pagar-receber")).toBe(true);
    // ...mas os atalhos "Nova ficha técnica" e "Contas a pagar e receber" são da gestão.
    const lista = acoesDisponiveis(menuOperacional, false).map((a) => a.titulo);
    expect(lista).not.toContain("Nova ficha técnica");
    expect(lista).not.toContain("Contas a pagar e receber");
  });
});
