import { describe, expect, it } from "vitest";
import { filtrarMenus, normalizarBusca } from "./filtro";
import { montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";

const gestao: ContextoMenuRestaurante = {
  podeGerir: true,
  consolidadoVendasHabilitado: true,
  financeiroGerencialHabilitado: true,
  fichasTecnicasHabilitado: true,
  equipeHabilitado: true,
  garanteHabilitado: true,
  conciliacaoHabilitada: true,
};
const menu = montarMenuRestaurantePiloto(gestao);

function hrefs(itens: ReturnType<typeof filtrarMenus>) {
  return itens.flatMap((item) => (item.sections ?? []).flatMap((s) => s.items.map((i) => i.href)));
}

describe("normalizarBusca", () => {
  it("tira acento, caixa e espaço sobrando", () => {
    expect(normalizarBusca("  Conciliação   DE  Cartões ")).toBe("conciliacao de cartoes");
  });
});

describe("filtrarMenus", () => {
  it("termo vazio devolve o menu inteiro, sem cópia", () => {
    expect(filtrarMenus(menu, "")).toBe(menu);
    expect(filtrarMenus(menu, "   ")).toBe(menu);
  });

  it("casa sem acento e sem caixa", () => {
    const resultado = filtrarMenus(menu, "CONCILIACAO");
    expect(resultado.map((i) => i.label)).toEqual(["Financeiro"]);
    expect(hrefs(resultado)).toEqual(["/financeiro-gerencial/conciliacao"]);
  });

  it("casou no módulo: módulo inteiro", () => {
    const [cadastros] = filtrarMenus(menu, "cadastros");
    expect(cadastros.label).toBe("Cadastros");
    expect(cadastros.sections).toEqual(menu.find((i) => i.label === "Cadastros")?.sections);
  });

  it("casou na seção: seção inteira", () => {
    const resultado = filtrarMenus(menu, "fornecedores");
    expect(resultado.map((i) => i.label)).toEqual(["Cadastros"]);
    expect(hrefs(resultado)).toEqual(["/estoque/fornecedores", "/estoque/fornecedores/edicao"]);
  });

  it("casou no item: só o item, dentro do seu grupo", () => {
    const resultado = filtrarMenus(menu, "editar");
    expect(resultado.map((i) => i.label)).toEqual(["Cadastros"]);
    expect(hrefs(resultado)).toEqual(["/estoque/produtos/edicao", "/estoque/fornecedores/edicao"]);
  });

  it("várias palavras valem pelo caminho módulo > seção > item", () => {
    expect(hrefs(filtrarMenus(menu, "estoque contagem"))).toEqual([
      "/estoque/contagem",
      "/estoque/contagem/visualizacao",
    ]);
    expect(hrefs(filtrarMenus(menu, "produtos editar"))).toEqual(["/estoque/produtos/edicao"]);
  });

  it("módulo sem seções e módulo em breve aparecem pelo nome", () => {
    expect(filtrarMenus(menu, "inicio").map((i) => i.label)).toEqual(["Início"]);
    const [marketing] = filtrarMenus(menu, "marketing");
    expect(marketing).toMatchObject({ label: "Marketing", disabled: true });
  });

  it("nada casa: lista vazia", () => {
    expect(filtrarMenus(menu, "xyz inexistente")).toEqual([]);
  });

  it("não mostra o que o papel não vê: operacional não acha Editar dados", () => {
    const operacional = montarMenuRestaurantePiloto({ ...gestao, podeGerir: false });
    expect(filtrarMenus(operacional, "editar")).toEqual([]);
    expect(filtrarMenus(operacional, "fornecedores")).toEqual([]);
  });
});
