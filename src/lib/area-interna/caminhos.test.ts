import { describe, expect, it } from "vitest";
import { ehCaminhoAreaInterna, ehCaminhoRestaurante, escolherOrganizacaoMaster } from "./caminhos";

const orgs = [
  { id: "adega-alemao", areaInterna: false },
  { id: "dom-quixote", areaInterna: false },
  { id: "zatti-hub", areaInterna: true },
];

describe("caminhos da área interna", () => {
  it("reconhece as telas do Vinícius, inclusive as rotas antigas", () => {
    for (const c of ["/inicio", "/agenda/dia", "/meu-tempo/hoje", "/escritorio", "/escritorio/comercial/abc", "/acessos"]) {
      expect(ehCaminhoAreaInterna(c)).toBe(true);
    }
    expect(ehCaminhoAreaInterna("/estoque/produtos")).toBe(false);
    expect(ehCaminhoAreaInterna("/agendamento")).toBe(false);
  });

  it("reconhece as telas de restaurante, incluindo financeiro-gerencial", () => {
    for (const c of ["/painel", "/estoque/contagem", "/financeiro/consolidado", "/financeiro-gerencial/dre", "/garante"]) {
      expect(ehCaminhoRestaurante(c)).toBe(true);
    }
    expect(ehCaminhoRestaurante("/inicio")).toBe(false);
  });
});

describe("escolherOrganizacaoMaster", () => {
  const prontas = new Set(["adega-alemao", "dom-quixote", "zatti-hub"]);

  it("tela da área interna abre a Zatti HUB mesmo com um cliente salvo", () => {
    expect(escolherOrganizacaoMaster({ organizacoes: orgs, caminho: "/agenda/dia", preferida: "dom-quixote", prontas })).toBe("zatti-hub");
  });

  it("fora da área interna vale a preferência salva", () => {
    expect(escolherOrganizacaoMaster({ organizacoes: orgs, caminho: "/painel", preferida: "dom-quixote", prontas })).toBe("dom-quixote");
    expect(escolherOrganizacaoMaster({ organizacoes: orgs, caminho: "/painel", preferida: "zatti-hub", prontas })).toBe("zatti-hub");
  });

  it("sem preferência continua caindo no primeiro cliente pronto, nunca na Zatti HUB", () => {
    expect(escolherOrganizacaoMaster({ organizacoes: orgs, caminho: "/painel", preferida: undefined, prontas: new Set(["zatti-hub", "dom-quixote"]) })).toBe("dom-quixote");
  });

  it("preferência que não existe mais é ignorada", () => {
    expect(escolherOrganizacaoMaster({ organizacoes: orgs, caminho: "/painel", preferida: "sumiu", prontas })).toBe("adega-alemao");
  });

  it("sem a Zatti HUB cadastrada, telas internas seguem a regra antiga", () => {
    const semInterna = orgs.filter((o) => !o.areaInterna);
    expect(escolherOrganizacaoMaster({ organizacoes: semInterna, caminho: "/agenda/dia", preferida: "dom-quixote", prontas })).toBe("dom-quixote");
  });
});
