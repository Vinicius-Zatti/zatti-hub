import { describe, expect, it } from "vitest";
import {
  AREAS_RELATORIOS,
  CATALOGO_CADASTROS,
  CATALOGO_RELATORIOS,
  agruparPorArea,
  buscarPorNome,
  filtrarCatalogo,
  type EntradaCatalogo,
} from "./catalogos";
import { montarMenuRestaurante, montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";
import { destinosVisiveis } from "./atalhos";

const tudoLigado: ContextoMenuRestaurante = {
  podeGerir: true,
  consolidadoVendasHabilitado: true,
  financeiroGerencialHabilitado: true,
  fichasTecnicasHabilitado: true,
  equipeHabilitado: true,
  garanteHabilitado: true,
  conciliacaoHabilitada: true,
};

const titulos = (
  catalogo: readonly EntradaCatalogo[],
  ctx: Partial<ContextoMenuRestaurante>,
  extratoEstoqueHabilitado = true,
) =>
  filtrarCatalogo(catalogo, montarMenuRestaurantePiloto({ ...tudoLigado, ...ctx }), { extratoEstoqueHabilitado }).map(
    (e) => e.titulo,
  );

const relatorios = (ctx: Partial<ContextoMenuRestaurante>, extrato = true) =>
  filtrarCatalogo(CATALOGO_RELATORIOS, montarMenuRestaurantePiloto({ ...tudoLigado, ...ctx }), {
    extratoEstoqueHabilitado: extrato,
  });

const porArea = (ctx: Partial<ContextoMenuRestaurante>, extrato = true) =>
  Object.fromEntries(agruparPorArea(relatorios(ctx, extrato)).map((g) => [g.area, g.itens.map((i) => i.titulo)]));

describe("catálogo de Relatórios", () => {
  it("gestão/master com tudo ligado vê todas as áreas, na ordem", () => {
    expect(porArea({})).toEqual({
      Financeiro: ["Painel M.E.G.A.", "DRE", "Fluxo de Caixa", "DFC"],
      Estoque: ["CMV Real", "Contagens", "Pedidos feitos", "Perdas", "Movimentações"],
      Garante: ["Quadro do dia", "Nota do Garante"],
      Vendas: ["Painel de vendas"],
    });
    expect(agruparPorArea(relatorios({})).map((g) => g.area)).toEqual([...AREAS_RELATORIOS]);
  });

  it("operacional: sem CMV Real, sem a gestão do Garante e sem o Painel de vendas", () => {
    expect(porArea({ podeGerir: false })).toEqual({
      Financeiro: ["Painel M.E.G.A.", "DRE", "Fluxo de Caixa", "DFC"],
      Estoque: ["Contagens", "Pedidos feitos", "Perdas", "Movimentações"],
    });
  });

  it("cada área segue a flag do módulo", () => {
    const semNada = porArea({
      financeiroGerencialHabilitado: false,
      consolidadoVendasHabilitado: false,
      garanteHabilitado: false,
    });
    expect(Object.keys(semNada)).toEqual(["Estoque"]);
    expect(porArea({ consolidadoVendasHabilitado: false }).Vendas).toBeUndefined();
    expect(porArea({ garanteHabilitado: false }).Garante).toBeUndefined();
    expect(porArea({ financeiroGerencialHabilitado: false }).Financeiro).toBeUndefined();
  });

  it("Perdas e Movimentações só com o extrato do estoque ligado", () => {
    expect(porArea({}, false).Estoque).toEqual(["CMV Real", "Contagens", "Pedidos feitos"]);
    expect(porArea({ podeGerir: false }, false).Estoque).toEqual(["Contagens", "Pedidos feitos"]);
  });

  it("busca pelo nome, sem acento e sem maiúscula", () => {
    const todos = relatorios({});
    expect(buscarPorNome(todos, "movimentacoes").map((e) => e.titulo)).toEqual(["Movimentações"]);
    expect(buscarPorNome(todos, "PAINEL").map((e) => e.titulo)).toEqual(["Painel M.E.G.A.", "Painel de vendas"]);
    expect(buscarPorNome(todos, "  ")).toHaveLength(todos.length);
    expect(buscarPorNome(todos, "xyz")).toEqual([]);
  });

  it("todo relatório tem nome, frase e área", () => {
    for (const r of CATALOGO_RELATORIOS) {
      expect(r.titulo.length).toBeGreaterThan(0);
      expect(r.descricao.length).toBeGreaterThan(10);
      expect(AREAS_RELATORIOS).toContain(r.area);
    }
  });
});

describe("catálogo de Cadastros", () => {
  it("gestão com tudo ligado vê os sete", () => {
    expect(titulos(CATALOGO_CADASTROS, {})).toEqual([
      "Produtos",
      "Setores",
      "Fornecedores",
      "Categorias de fichas",
      "Conversões de unidade",
      "Contas financeiras",
      "Plano de Contas",
    ]);
  });

  it("cada grupo segue a flag do módulo de origem; operacional não vê nenhum", () => {
    expect(titulos(CATALOGO_CADASTROS, { fichasTecnicasHabilitado: false, financeiroGerencialHabilitado: false })).toEqual([
      "Produtos",
      "Setores",
      "Fornecedores",
    ]);
    expect(titulos(CATALOGO_CADASTROS, { podeGerir: false })).toEqual([]);
  });
});

it("todo bloco aponta para uma tela que já existe (menu atual ou abas da Contagem)", () => {
  const atual = destinosVisiveis(montarMenuRestaurante(tudoLigado));
  // Perdas e Movimentações abrem hoje pelas abas da Contagem, não pelo menu.
  const abasDaContagem = new Set(["/estoque/contagem/perdas", "/estoque/contagem/movimentacoes"]);
  for (const entrada of [...CATALOGO_RELATORIOS, ...CATALOGO_CADASTROS]) {
    expect(atual.has(entrada.href) || abasDaContagem.has(entrada.href), entrada.href).toBe(true);
  }
});
