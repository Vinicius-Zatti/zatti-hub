import { describe, expect, it } from "vitest";
import { cabecalhoDoModulo, comContagemBase } from "./abas";
import { destinosVisiveis } from "./atalhos";
import { ROTULO_CARDAPIO, montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "./menu-restaurante";

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

const gestao = montarMenuRestaurantePiloto(tudoLigado);
const operacional = montarMenuRestaurantePiloto({ ...tudoLigado, podeGerir: false });

describe("cabeçalho do módulo", () => {
  it("na entrada: título do módulo, sem seta de voltar", () => {
    expect(cabecalhoDoModulo(gestao, "/estoque/visao-geral")).toMatchObject({
      modulo: "Estoque",
      entrada: "/estoque/visao-geral",
      naEntrada: true,
      titulo: "Estoque",
      abaAtiva: "/estoque/visao-geral",
    });
  });

  it("em tela interna: título da tela, módulo embaixo e volta para a entrada", () => {
    expect(cabecalhoDoModulo(gestao, "/estoque/contagem/perdas")).toMatchObject({
      modulo: "Estoque",
      entrada: "/estoque/visao-geral",
      naEntrada: false,
      titulo: "Perdas",
      abaAtiva: "/estoque/contagem/perdas",
    });
  });

  it("tela de detalhe fica na aba da lista dela", () => {
    expect(cabecalhoDoModulo(gestao, "/fichas-tecnicas/abc")).toMatchObject({
      modulo: ROTULO_CARDAPIO,
      naEntrada: false,
      titulo: "Fichas técnicas",
      abaAtiva: "/fichas-tecnicas",
    });
    expect(cabecalhoDoModulo(gestao, "/garante/execucao/abc")).toMatchObject({ modulo: "Garante", abaAtiva: "/garante" });
  });

  it("Início não tem cabeçalho; Equipe tem título e nenhuma aba", () => {
    expect(cabecalhoDoModulo(gestao, "/painel")).toBeNull();
    expect(cabecalhoDoModulo(gestao, "/equipe")).toMatchObject({ modulo: "Equipe", abas: [], naEntrada: true });
  });

  it("Contas a pagar e receber é do Financeiro; Contas financeiras é de Cadastros", () => {
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/contas-pagar-receber")?.modulo).toBe("Financeiro");
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/contas")?.modulo).toBe("Cadastros");
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/dre")?.modulo).toBe("Relatórios");
  });

  it("abas do Estoque respeitam o papel", () => {
    expect(cabecalhoDoModulo(operacional, "/estoque/visao-geral")?.abas.map((a) => a.label)).toEqual([
      "Visão geral",
      "Fazer contagem",
      "Conferir contagens",
      "Movimentações",
      "Perdas",
      "Pedidos feitos",
      "Produtos",
    ]);
  });

  it("módulo 'em breve' não abre cabeçalho", () => {
    const semGarante = montarMenuRestaurantePiloto({ ...tudoLigado, garanteHabilitado: false });
    expect(cabecalhoDoModulo(semGarante, "/garante")).toBeNull();
  });
});

describe("abas saem do menu (uma fonte só), em toda combinação de papel e flag", () => {
  it("as abas de cada módulo são os subitens dele e todas são destinos visíveis", () => {
    for (const ctx of todosOsContextos()) {
      const menu = montarMenuRestaurantePiloto(ctx);
      const visiveis = destinosVisiveis(menu);
      for (const modulo of menu) {
        if (modulo.disabled || !modulo.sections) continue;
        const cab = cabecalhoDoModulo(menu, modulo.href);
        const esperado = modulo.sections.flatMap((s) => s.items.map((i) => i.href));
        expect(cab?.modulo, `${modulo.label} ${JSON.stringify(ctx)}`).toBe(modulo.label);
        expect(cab?.abas.map((a) => a.href)).toEqual(esperado);
        expect(cab?.naEntrada).toBe(true);
        for (const aba of cab?.abas ?? []) expect(visiveis.has(aba.href)).toBe(true);
      }
    }
  });
});

describe("abas de Pedidos levam o ?data= da contagem base", () => {
  it("só as três telas de Pedidos", () => {
    const abas = [
      { label: "Criar cotação", href: "/estoque/pedidos" },
      { label: "Pedidos feitos", href: "/estoque/pedidos/feitos" },
      { label: "CMV Real", href: "/estoque/cmv" },
    ];
    expect(comContagemBase(abas, "03/08/2026").map((a) => a.href)).toEqual([
      "/estoque/pedidos?data=03%2F08%2F2026",
      "/estoque/pedidos/feitos?data=03%2F08%2F2026",
      "/estoque/cmv",
    ]);
    expect(comContagemBase(abas, null)).toBe(abas);
  });
});
