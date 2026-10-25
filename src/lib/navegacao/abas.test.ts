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

const rotulos = (abas: { label: string }[] | undefined) => abas?.map((a) => a.label);

describe("cabeçalho do módulo", () => {
  it("na entrada: título do módulo, sem seta de voltar e sem nível 2", () => {
    expect(cabecalhoDoModulo(gestao, "/estoque/visao-geral")).toMatchObject({
      modulo: "Estoque",
      entrada: "/estoque/visao-geral",
      naEntrada: true,
      titulo: "Estoque",
      abaAtiva: "/estoque/visao-geral",
      subAbas: [],
    });
  });

  it("em tela interna: título da tela, módulo embaixo e volta para a entrada", () => {
    expect(cabecalhoDoModulo(gestao, "/estoque/contagem/perdas")).toMatchObject({
      modulo: "Estoque",
      entrada: "/estoque/visao-geral",
      naEntrada: false,
      titulo: "Perdas",
      abaAtiva: "/estoque/contagem/perdas",
      subAbas: [],
    });
  });

  it("tela de detalhe fica na aba da lista dela", () => {
    expect(cabecalhoDoModulo(gestao, "/fichas-tecnicas/abc")).toMatchObject({
      modulo: ROTULO_CARDAPIO,
      naEntrada: false,
      titulo: "Fichas técnicas",
      abaAtiva: "/fichas-tecnicas",
    });
    expect(cabecalhoDoModulo(gestao, "/garante/execucao/abc")).toMatchObject({
      modulo: "Garante",
      abaAtiva: "/garante",
      subAbaAtiva: "/garante",
    });
  });

  it("Início: gestão tem as abas Início | Dashboard; operacional, só o título", () => {
    expect(cabecalhoDoModulo(gestao, "/painel")).toMatchObject({
      modulo: "Início",
      naEntrada: true,
      titulo: "Início",
      abas: [
        { label: "Início", href: "/painel" },
        { label: "Dashboard", href: "/painel/dashboard" },
      ],
      abaAtiva: "/painel",
    });
    expect(cabecalhoDoModulo(gestao, "/painel/dashboard")).toMatchObject({
      naEntrada: false,
      titulo: "Dashboard",
      entrada: "/painel",
      abaAtiva: "/painel/dashboard",
    });
    expect(cabecalhoDoModulo(operacional, "/painel")).toMatchObject({ modulo: "Início", abas: [], naEntrada: true });
  });

  it("Equipe tem título e nenhuma aba", () => {
    expect(cabecalhoDoModulo(gestao, "/equipe")).toMatchObject({ modulo: "Equipe", abas: [], subAbas: [], naEntrada: true });
  });

  it("Contas a pagar e receber é do Financeiro; Contas financeiras é de Cadastros", () => {
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/contas-pagar-receber")?.modulo).toBe("Financeiro");
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/contas")?.modulo).toBe("Cadastros");
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/dre")?.modulo).toBe("Relatórios");
  });

  it("módulo 'em breve' não abre cabeçalho", () => {
    const semGarante = montarMenuRestaurantePiloto({ ...tudoLigado, garanteHabilitado: false });
    expect(cabecalhoDoModulo(semGarante, "/garante")).toBeNull();
  });
});

describe("abas em dois níveis (24/10)", () => {
  it("Estoque: nível 1 são as seções, na ordem de uso", () => {
    expect(rotulos(cabecalhoDoModulo(gestao, "/estoque/visao-geral")?.abas)).toEqual([
      "Visão geral",
      "Produtos",
      "Contagem",
      "Pedidos",
      "CMV Real",
      "Perdas",
      "Movimentações",
    ]);
  });

  it("seção com várias telas abre o nível 2 e a aba da seção leva à primeira tela", () => {
    const conferir = cabecalhoDoModulo(gestao, "/estoque/contagem/visualizacao");
    expect(conferir).toMatchObject({ abaAtiva: "/estoque/contagem", subAbaAtiva: "/estoque/contagem/visualizacao" });
    expect(conferir?.abas.find((a) => a.label === "Contagem")?.href).toBe("/estoque/contagem");
    expect(rotulos(conferir?.subAbas)).toEqual(["Fazer contagem", "Conferir contagens"]);

    const feitos = cabecalhoDoModulo(gestao, "/estoque/pedidos/feitos");
    expect(feitos).toMatchObject({ abaAtiva: "/estoque/pedidos", subAbaAtiva: "/estoque/pedidos/feitos", titulo: "Pedidos feitos" });
    expect(rotulos(feitos?.subAbas)).toEqual(["Criar cotação", "Editor de espelhos", "Pedidos feitos"]);
  });

  it("seção de uma tela só não tem nível 2", () => {
    for (const tela of ["/estoque/produtos", "/estoque/cmv", "/estoque/contagem/movimentacoes"]) {
      expect(cabecalhoDoModulo(gestao, tela)?.subAbas, tela).toEqual([]);
    }
  });

  it("operacional: sem CMV Real e Pedidos só com Pedidos feitos (sem nível 2)", () => {
    expect(rotulos(cabecalhoDoModulo(operacional, "/estoque/visao-geral")?.abas)).toEqual([
      "Visão geral",
      "Produtos",
      "Contagem",
      "Pedidos",
      "Perdas",
      "Movimentações",
    ]);
    const pedidos = cabecalhoDoModulo(operacional, "/estoque/pedidos/feitos");
    expect(pedidos?.abas.find((a) => a.label === "Pedidos")?.href).toBe("/estoque/pedidos/feitos");
    expect(pedidos?.subAbas).toEqual([]);
  });

  it("Financeiro usa as seções do menu, na mesma ordem", () => {
    expect(rotulos(cabecalhoDoModulo(gestao, "/financeiro-gerencial/visao-geral")?.abas)).toEqual([
      "Dia a dia",
      "Lançamentos",
      "Fechamento do mês",
    ]);
    expect(rotulos(cabecalhoDoModulo(operacional, "/financeiro-gerencial/visao-geral")?.abas)).toEqual([
      "Dia a dia",
      "Lançamentos",
    ]);
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/lancamentos/despesas")).toMatchObject({
      abaAtiva: "/financeiro-gerencial/lancamentos/receitas",
      subAbaAtiva: "/financeiro-gerencial/lancamentos/despesas",
    });
  });

  it("Garante: Cumprir e Gestão para a gestão; operacional (uma seção) vê as telas direto", () => {
    expect(rotulos(cabecalhoDoModulo(gestao, "/garante")?.abas)).toEqual(["Cumprir", "Gestão"]);
    expect(cabecalhoDoModulo(operacional, "/garante")).toMatchObject({
      abas: [
        { label: "Hoje", href: "/garante" },
        { label: "Planos de ação", href: "/garante/planos" },
      ],
      abaAtiva: "/garante",
      subAbas: [],
    });
  });

  it("módulo de uma seção só (Vendas, Cardápio, Relatórios) mostra as telas no nível 1", () => {
    expect(rotulos(cabecalhoDoModulo(gestao, "/financeiro/consolidado")?.abas)).toEqual([
      "Novo lançamento",
      "Histórico",
      "Dashboard",
    ]);
    expect(cabecalhoDoModulo(gestao, "/fichas-tecnicas")?.subAbas).toEqual([]);
    expect(cabecalhoDoModulo(gestao, "/financeiro-gerencial/dre")).toMatchObject({
      abaAtiva: "/financeiro-gerencial/dre",
      subAbas: [],
    });
  });

  it("Cadastros: grupos no nível 1; Fornecedores abre o nível 2", () => {
    expect(rotulos(cabecalhoDoModulo(gestao, "/cadastros")?.abas)).toEqual([
      "Todos os cadastros",
      "Produtos",
      "Setores",
      "Fornecedores",
      "Fichas técnicas",
      "Financeiro",
    ]);
    expect(rotulos(cabecalhoDoModulo(gestao, "/estoque/fornecedores/edicao")?.subAbas)).toEqual([
      "Consultar fornecedores",
      "Editar fornecedores",
    ]);
  });
});

describe("abas saem do menu (uma fonte só), em toda combinação de papel e flag", () => {
  it("cada tela do módulo acende sua aba; nada fora do que o menu mostra", () => {
    for (const ctx of todosOsContextos()) {
      const menu = montarMenuRestaurantePiloto(ctx);
      const visiveis = destinosVisiveis(menu);
      for (const modulo of menu) {
        if (modulo.disabled || !modulo.sections) continue;
        const secoes = modulo.sections.filter((s) => s.items.length > 0);
        const entrada = cabecalhoDoModulo(menu, modulo.href);
        const contexto = `${modulo.label} ${JSON.stringify(ctx)}`;
        expect(entrada?.modulo, contexto).toBe(modulo.label);
        expect(entrada?.naEntrada).toBe(true);
        // Nível 1: uma aba por seção (ou as telas, quando só há uma seção).
        const esperadoNivel1 =
          secoes.length > 1 ? secoes.map((s) => s.items[0].href) : secoes.flatMap((s) => s.items.map((i) => i.href));
        expect(entrada?.abas.map((a) => a.href), contexto).toEqual(esperadoNivel1);
        for (const secao of secoes) {
          for (const tela of secao.items) {
            const cab = cabecalhoDoModulo(menu, tela.href);
            expect(visiveis.has(tela.href)).toBe(true);
            if (secoes.length > 1) {
              expect(cab?.abaAtiva, `${tela.href} ${contexto}`).toBe(secao.items[0].href);
              expect(cab?.subAbas.map((a) => a.href)).toEqual(secao.items.length > 1 ? secao.items.map((i) => i.href) : []);
              expect(cab?.subAbaAtiva).toBe(secao.items.length > 1 ? tela.href : undefined);
            } else {
              expect(cab?.abaAtiva, `${tela.href} ${contexto}`).toBe(tela.href);
              expect(cab?.subAbas).toEqual([]);
            }
          }
        }
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
