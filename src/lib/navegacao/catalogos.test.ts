import { describe, expect, it } from "vitest";
import { CATALOGO_CADASTROS, CATALOGO_RELATORIOS, filtrarCatalogo } from "./catalogos";
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

const titulos = (catalogo: typeof CATALOGO_RELATORIOS, ctx: Partial<ContextoMenuRestaurante>) =>
  filtrarCatalogo(catalogo, montarMenuRestaurantePiloto({ ...tudoLigado, ...ctx })).map((e) => e.titulo);

describe("catálogo de Relatórios", () => {
  it("gestão com tudo ligado vê os cinco", () => {
    expect(titulos(CATALOGO_RELATORIOS, {})).toEqual(["DRE", "Fluxo de Caixa", "DFC", "Painel M.E.G.A.", "Painel de vendas"]);
  });

  it("operacional não vê o Painel de vendas (Dashboard é só gestão, como hoje)", () => {
    expect(titulos(CATALOGO_RELATORIOS, { podeGerir: false })).toEqual(["DRE", "Fluxo de Caixa", "DFC", "Painel M.E.G.A."]);
  });

  it("sem Financeiro: só o Painel de vendas; sem Vendas também: nada", () => {
    expect(titulos(CATALOGO_RELATORIOS, { financeiroGerencialHabilitado: false })).toEqual(["Painel de vendas"]);
    expect(
      titulos(CATALOGO_RELATORIOS, { financeiroGerencialHabilitado: false, consolidadoVendasHabilitado: false }),
    ).toEqual([]);
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

it("todo bloco aponta para uma tela que o menu atual já abre (nenhum destino novo)", () => {
  const atual = destinosVisiveis(montarMenuRestaurante(tudoLigado));
  for (const entrada of [...CATALOGO_RELATORIOS, ...CATALOGO_CADASTROS]) expect(atual.has(entrada.href), entrada.href).toBe(true);
});
