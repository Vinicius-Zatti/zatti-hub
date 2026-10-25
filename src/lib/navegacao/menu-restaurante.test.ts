import { describe, expect, it } from "vitest";
import { destinosVisiveis } from "./atalhos";
import {
  CONFIGURACOES_MODULOS,
  ENTRADA_CADASTROS,
  ENTRADA_CONFIGURACOES,
  ENTRADA_ESTOQUE,
  ENTRADA_RELATORIOS,
  ROTULO_CARDAPIO,
  ROTULO_VENDAS,
  montarMenuRestaurante,
  contextoMenuRestaurante,
  montarMenuRestaurantePiloto,
  podeVerConfiguracoes,
  type ContextoMenuRestaurante,
} from "./menu-restaurante";
import { moduloAtivo, subitemAtivo, type ItemNavegacao } from "./tipos";

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

const tudoLigado: ContextoMenuRestaurante = Object.fromEntries(CHAVES.map((c) => [c, true])) as ContextoMenuRestaurante;

/** Destinos novos do piloto: as três páginas de entrada e as duas abas da
 * Contagem que já abriam para todos os papéis pelas SubTabs de hoje. */
const NOVOS_NO_MENU = new Set([
  ENTRADA_ESTOQUE,
  ENTRADA_RELATORIOS,
  ENTRADA_CADASTROS,
  "/estoque/contagem/movimentacoes",
  "/estoque/contagem/perdas",
]);

/** "Em breve" do menu atual com o nome que o módulo ganhou no piloto. */
const RENOMEADOS: Record<string, string> = {
  Desempenho: ROTULO_VENDAS,
  Financeiro: "Financeiro",
  Precificação: ROTULO_CARDAPIO,
  "Checklist Garante": "Garante",
};

function hrefsDoMenu(itens: ItemNavegacao[]): string[] {
  return itens.flatMap((item) =>
    item.sections ? item.sections.flatMap((s) => s.items.map((i) => i.href)) : [item.href],
  );
}

describe("menu atual (fora do piloto) não muda", () => {
  it("módulos e ordem", () => {
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
    expect(montarMenuRestaurante(tudoLigado)[3].sections?.map((s) => s.label)).toEqual([
      "Dia a dia",
      "Lançamentos",
      "Relatórios",
      "Configurações",
    ]);
  });
});

describe("menu do piloto x menu atual, nas 128 combinações de papel e flag", () => {
  it("mesmos destinos visíveis; a mais, só as entradas novas e Movimentações/Perdas", () => {
    for (const ctx of todosOsContextos()) {
      const piloto = destinosVisiveis(montarMenuRestaurantePiloto(ctx));
      const atual = destinosVisiveis(montarMenuRestaurante(ctx));
      const pilotoSemNovos = [...piloto].filter((href) => !NOVOS_NO_MENU.has(href)).sort();
      expect(pilotoSemNovos, JSON.stringify(ctx)).toEqual([...atual].sort());
    }
  });

  it("mesmos módulos 'em breve' (Marketing sai do piloto)", () => {
    for (const ctx of todosOsContextos()) {
      const atual = montarMenuRestaurante(ctx)
        .filter((i) => i.disabled && i.label !== "Marketing")
        .map((i) => RENOMEADOS[i.label]);
      const piloto = montarMenuRestaurantePiloto(ctx)
        .filter((i) => i.disabled)
        .map((i) => i.label);
      expect(piloto, JSON.stringify(ctx)).toEqual(atual);
    }
  });

  it("entrada nova só existe com ao menos uma tela de dentro visível", () => {
    for (const ctx of todosOsContextos()) {
      const menu = montarMenuRestaurantePiloto(ctx);
      const relatorios = menu.find((i) => i.label === "Relatórios");
      const cadastros = menu.find((i) => i.label === "Cadastros");
      // O catálogo sempre tem relatório do Estoque (Contagens, todos os papéis).
      expect(Boolean(relatorios), JSON.stringify(ctx)).toBe(true);
      expect(Boolean(cadastros), JSON.stringify(ctx)).toBe(ctx.podeGerir);
      expect(destinosVisiveis(menu).has(ENTRADA_ESTOQUE)).toBe(true);
    }
  });

  it("nenhum destino aparece em dois lugares do menu", () => {
    for (const ctx of todosOsContextos()) {
      const hrefs = hrefsDoMenu(montarMenuRestaurantePiloto(ctx).filter((i) => !i.disabled));
      expect(new Set(hrefs).size, JSON.stringify(ctx)).toBe(hrefs.length);
    }
  });
});

describe("estrutura de módulos do piloto (24/10)", () => {
  const piloto = montarMenuRestaurantePiloto(tudoLigado);
  const modulo = (label: string) => piloto.find((i) => i.label === label);
  const hrefs = (label: string) => hrefsDoMenu([modulo(label)!]);

  it("ordem dos módulos, sem Configurações", () => {
    expect(piloto.map((i) => i.label)).toEqual([
      "Início",
      "Estoque",
      ROTULO_VENDAS,
      "Financeiro",
      ROTULO_CARDAPIO,
      "Garante",
      "Equipe",
      "Relatórios",
      "Cadastros",
    ]);
    expect(ROTULO_VENDAS).toBe("Vendas");
    expect(ROTULO_CARDAPIO).toBe("Cardápio");
  });

  it("Estoque na ordem de uso (24/10): Visão geral, Produtos, Contagem, Pedidos, CMV Real, Perdas, Movimentações", () => {
    expect(modulo("Estoque")?.href).toBe(ENTRADA_ESTOQUE);
    expect(modulo("Estoque")?.sections?.map((s) => s.label)).toEqual([
      "Visão geral",
      "Produtos",
      "Contagem",
      "Pedidos",
      "CMV Real",
      "Perdas",
      "Movimentações",
    ]);
    expect(hrefs("Estoque")).toEqual([
      ENTRADA_ESTOQUE,
      "/estoque/produtos",
      "/estoque/contagem",
      "/estoque/contagem/visualizacao",
      "/estoque/pedidos",
      "/estoque/pedidos/cotacoes",
      "/estoque/pedidos/feitos",
      "/estoque/cmv",
      "/estoque/contagem/perdas",
      "/estoque/contagem/movimentacoes",
    ]);
  });

  it("Vendas é o Desempenho com outro nome: lançar, histórico e painel", () => {
    expect(hrefs(ROTULO_VENDAS)).toEqual([
      "/financeiro/consolidado/novo",
      "/financeiro/consolidado",
      "/financeiro/consolidado/dashboard",
    ]);
  });

  it("Financeiro sem relatórios, sem Contas financeiras e sem Plano de Contas; com Fechamento e Provisões", () => {
    const financeiro = hrefs("Financeiro");
    for (const fora of [
      "/financeiro-gerencial/dre",
      "/financeiro-gerencial/fluxo-caixa",
      "/financeiro-gerencial/dfc",
      "/financeiro-gerencial/painel-mega",
      "/financeiro-gerencial/contas",
      "/financeiro-gerencial/categorias",
    ]) {
      expect(financeiro).not.toContain(fora);
    }
    expect(financeiro).toContain("/financeiro-gerencial/fechamento");
    expect(financeiro).toContain("/financeiro-gerencial/provisoes");
  });

  it("Cardápio: fichas, margem ideal e precificação; categorias e conversões vão para Cadastros", () => {
    expect(hrefs(ROTULO_CARDAPIO)).toEqual([
      "/fichas-tecnicas",
      "/fichas-tecnicas/calculadora",
      "/fichas-tecnicas/precificacao",
    ]);
  });

  it("Garante é módulo próprio; Equipe fica só com colaboradores", () => {
    expect(hrefs("Garante")).toEqual([
      "/garante",
      "/garante/planos",
      "/garante/quadro",
      "/garante/nota",
      "/garante/modelos",
    ]);
    expect(modulo("Equipe")?.href).toBe("/equipe");
    expect(modulo("Equipe")?.sections).toBeUndefined();
  });

  it("Relatórios e Cadastros", () => {
    expect(hrefs("Relatórios")).toEqual([
      ENTRADA_RELATORIOS,
      "/financeiro-gerencial/painel-mega",
      "/financeiro-gerencial/dre",
      "/financeiro-gerencial/fluxo-caixa",
      "/financeiro-gerencial/dfc",
    ]);
    expect(hrefs("Cadastros")).toEqual([
      ENTRADA_CADASTROS,
      "/estoque/produtos/edicao",
      "/estoque/setores",
      "/estoque/fornecedores",
      "/estoque/fornecedores/edicao",
      "/fichas-tecnicas/categorias",
      "/fichas-tecnicas/conversoes",
      "/financeiro-gerencial/contas",
      "/financeiro-gerencial/categorias",
    ]);
  });

  it("operacional: sem CMV, sem criar cotação, sem Equipe e sem Cadastros", () => {
    const operacional = montarMenuRestaurantePiloto({ ...tudoLigado, podeGerir: false });
    expect(operacional.map((i) => i.label)).toEqual([
      "Início",
      "Estoque",
      ROTULO_VENDAS,
      "Financeiro",
      ROTULO_CARDAPIO,
      "Garante",
      "Relatórios",
    ]);
    expect(operacional[1].sections?.map((s) => s.label)).toEqual([
      "Visão geral",
      "Produtos",
      "Contagem",
      "Pedidos",
      "Perdas",
      "Movimentações",
    ]);
  });
});

describe("Configurações no piloto (24/10)", () => {
  it("aparece só com podeConfigurar, por último, com as abas Unidade e Módulos", () => {
    const sem = montarMenuRestaurantePiloto(tudoLigado);
    expect(sem.some((i) => i.label === "Configurações")).toBe(false);
    const com = montarMenuRestaurantePiloto({ ...tudoLigado, podeConfigurar: true });
    const config = com[com.length - 1];
    expect(config.label).toBe("Configurações");
    expect(config.href).toBe(ENTRADA_CONFIGURACOES);
    expect(config.sections?.flatMap((s) => s.items.map((i) => i.href))).toEqual([ENTRADA_CONFIGURACOES, CONFIGURACOES_MODULOS]);
    expect(moduloAtivo(com, CONFIGURACOES_MODULOS)).toBe("Configurações");
  });

  it("quem vê: master e dono (gestão sem unidade fixa); nunca operacional nem gestor de uma unidade", () => {
    expect(podeVerConfiguracoes({ role: "master", unidadeFixa: null })).toBe(true);
    expect(podeVerConfiguracoes({ role: "gestao", unidadeFixa: null })).toBe(true);
    expect(podeVerConfiguracoes({ role: "gestao", unidadeFixa: "zatti-burger" })).toBe(false);
    expect(podeVerConfiguracoes({ role: "operacional", unidadeFixa: null })).toBe(false);
    expect(podeVerConfiguracoes({ role: "operacional", unidadeFixa: "zatti-burger" })).toBe(false);
  });

  it("contextoMenuRestaurante leva a regra para o menu", () => {
    const base = {
      consolidadoVendasHabilitado: true,
      financeiroGerencialHabilitado: true,
      fichasTecnicasHabilitado: true,
      equipeHabilitado: true,
      garanteHabilitado: true,
    };
    const rotulos = (role: string, unidadeFixa: string | null) =>
      montarMenuRestaurantePiloto(contextoMenuRestaurante({ ...base, role, unidadeFixa }, true)).map((i) => i.label);
    expect(rotulos("master", null)).toContain("Configurações");
    expect(rotulos("gestao", null)).toContain("Configurações");
    expect(rotulos("gestao", "zatti-burger")).not.toContain("Configurações");
    expect(rotulos("operacional", null)).not.toContain("Configurações");
  });

  it("menu atual (fora do piloto) não ganha Configurações", () => {
    const atual = montarMenuRestaurante({ ...tudoLigado, podeConfigurar: true });
    expect(destinosVisiveis(atual).has(ENTRADA_CONFIGURACOES)).toBe(false);
  });
});

describe("módulo e subitem ativos no piloto", () => {
  const piloto = montarMenuRestaurantePiloto(tudoLigado);

  it("cada tela acende o módulo certo, inclusive quando o prefixo é de outro", () => {
    const casos: [string, string][] = [
      ["/painel", "Início"],
      [ENTRADA_ESTOQUE, "Estoque"],
      ["/estoque/contagem/perdas", "Estoque"],
      ["/estoque/produtos", "Estoque"],
      ["/estoque/produtos/edicao", "Cadastros"],
      ["/estoque/setores", "Cadastros"],
      ["/estoque/fornecedores/novo", "Cadastros"],
      ["/financeiro/consolidado/abc/editar", ROTULO_VENDAS],
      ["/financeiro-gerencial/contas-pagar-receber", "Financeiro"],
      ["/financeiro-gerencial/contas", "Cadastros"],
      ["/financeiro-gerencial/dre", "Relatórios"],
      ["/financeiro-gerencial/estoque", "Financeiro"],
      ["/fichas-tecnicas/abc", ROTULO_CARDAPIO],
      ["/fichas-tecnicas/conversoes", "Cadastros"],
      ["/garante/execucao/abc", "Garante"],
      ["/equipe", "Equipe"],
      [ENTRADA_RELATORIOS, "Relatórios"],
      [ENTRADA_CADASTROS, "Cadastros"],
    ];
    for (const [caminho, esperado] of casos) expect(moduloAtivo(piloto, caminho), caminho).toBe(esperado);
  });

  it("subitem ativo é o mais específico, inclusive em tela de detalhe", () => {
    expect(subitemAtivo(piloto, "/financeiro/consolidado/novo")).toBe("/financeiro/consolidado/novo");
    expect(subitemAtivo(piloto, "/financeiro/consolidado")).toBe("/financeiro/consolidado");
    expect(subitemAtivo(piloto, "/estoque/pedidos/feitos")).toBe("/estoque/pedidos/feitos");
    expect(subitemAtivo(piloto, "/estoque/fornecedores/novo")).toBe("/estoque/fornecedores");
    expect(subitemAtivo(piloto, "/estoque/produtos-x")).toBeUndefined();
  });
});
