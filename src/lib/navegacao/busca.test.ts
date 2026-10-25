import { describe, expect, it } from "vitest";
import { acoesDisponiveis } from "./acoes";
import { buscarEntradas, montarEntradasBusca, teclaAbreBusca } from "./busca";
import { montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";

const tudoLigado: ContextoMenuRestaurante = {
  podeGerir: true,
  consolidadoVendasHabilitado: true,
  financeiroGerencialHabilitado: true,
  fichasTecnicasHabilitado: true,
  equipeHabilitado: true,
  garanteHabilitado: true,
  conciliacaoHabilitada: true,
};

function entradas(ctx: Partial<ContextoMenuRestaurante> = {}) {
  const completo = { ...tudoLigado, ...ctx };
  const menu = montarMenuRestaurantePiloto(completo);
  return montarEntradasBusca(menu, acoesDisponiveis(menu, completo.podeGerir));
}

const gestao = entradas();
const operacional = entradas({ podeGerir: false });
const titulos = (lista: { titulo: string }[]) => lista.map((e) => e.titulo);

describe("entradas da busca global", () => {
  it("cada destino aparece uma vez; o atalho substitui a tela de mesmo destino", () => {
    const hrefs = gestao.map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const cotacao = gestao.filter((e) => e.href === "/estoque/pedidos");
    expect(cotacao).toHaveLength(1);
    expect(cotacao[0].tipo).toBe("acao");
  });

  it("tela de menu traz o caminho módulo > seção", () => {
    const conferir = gestao.find((e) => e.href === "/estoque/contagem/visualizacao");
    expect(conferir).toMatchObject({ tipo: "menu", titulo: "Conferir contagens", caminho: "Estoque > Contagem" });
    const produtos = gestao.find((e) => e.href === "/estoque/produtos");
    expect(produtos?.caminho).toBe("Estoque");
  });

  it("módulo 'em breve' fica de fora", () => {
    const semGarante = entradas({ garanteHabilitado: false });
    expect(semGarante.some((e) => e.href.startsWith("/garante"))).toBe(false);
  });
});

describe("permissão: a busca só acha o que o papel vê", () => {
  it("operacional não acha telas nem atalhos de gestão", () => {
    for (const termo of ["cotacao", "cmv", "quadro", "dashboard", "editar produtos", "plano de contas", "equipe"]) {
      expect(buscarEntradas(operacional, termo), termo).toEqual([]);
    }
  });

  it("gestão acha os mesmos termos", () => {
    expect(titulos(buscarEntradas(gestao, "cotacao"))[0]).toBe("Criar cotação");
    expect(titulos(buscarEntradas(gestao, "dashboard"))).toContain("Dashboard");
    expect(titulos(buscarEntradas(gestao, "quadro"))[0]).toBe("Quadro do Garante");
  });
});

describe("ranking", () => {
  it("sem acento e sem caixa: 'CONTAGEM' e 'contágem' acham Fazer contagem primeiro", () => {
    expect(titulos(buscarEntradas(gestao, "CONTAGEM"))[0]).toBe("Fazer contagem");
    expect(titulos(buscarEntradas(gestao, "contágem"))[0]).toBe("Fazer contagem");
  });

  it("título exato vence começo, que vence palavra no meio, que vence só o caminho", () => {
    const lista = titulos(buscarEntradas(gestao, "perdas"));
    expect(lista[0]).toBe("Perdas");
    const fluxo = titulos(buscarEntradas(gestao, "fluxo"));
    expect(fluxo[0]).toBe("Fluxo de Caixa");
  });

  it("várias palavras: todas precisam casar, em qualquer ordem", () => {
    expect(titulos(buscarEntradas(gestao, "contagem conferir"))[0]).toBe("Conferir contagens");
    expect(titulos(buscarEntradas(gestao, "estoque perdas"))).toEqual(["Perdas"]);
    expect(buscarEntradas(gestao, "contagem xyz")).toEqual([]);
  });

  it("sinônimo acha o atalho: 'inventario' leva a Fazer contagem, 'boleto' a Nova despesa", () => {
    expect(titulos(buscarEntradas(gestao, "inventario"))[0]).toBe("Fazer contagem");
    expect(titulos(buscarEntradas(gestao, "boleto"))[0]).toBe("Nova despesa");
  });

  it("'despesa': a tela que começa com a palavra vem antes do atalho que só a contém", () => {
    const lista = titulos(buscarEntradas(gestao, "despesa"));
    expect(lista.slice(0, 2)).toEqual(["Despesas", "Nova despesa"]);
  });

  it("sem termo: só os atalhos, na ordem do catálogo", () => {
    const sugestoes = buscarEntradas(operacional, "");
    expect(sugestoes.every((e) => e.tipo === "acao")).toBe(true);
    expect(titulos(sugestoes)[0]).toBe("Fazer contagem");
  });

  it("respeita o limite", () => {
    expect(buscarEntradas(gestao, "a", 5)).toHaveLength(5);
  });
});

describe("tecla que abre a busca", () => {
  const base = { key: "", ctrlKey: false, metaKey: false, altKey: false, emCampoDeTexto: false };
  it("Ctrl+K e Cmd+K em qualquer lugar", () => {
    expect(teclaAbreBusca({ ...base, key: "k", ctrlKey: true })).toBe(true);
    expect(teclaAbreBusca({ ...base, key: "K", metaKey: true, emCampoDeTexto: true })).toBe(true);
  });
  it("'/' só fora de campo de texto", () => {
    expect(teclaAbreBusca({ ...base, key: "/" })).toBe(true);
    expect(teclaAbreBusca({ ...base, key: "/", emCampoDeTexto: true })).toBe(false);
  });
  it("outras teclas e Alt não abrem", () => {
    expect(teclaAbreBusca({ ...base, key: "k" })).toBe(false);
    expect(teclaAbreBusca({ ...base, key: "k", ctrlKey: true, altKey: true })).toBe(false);
  });
});
