import { describe, expect, it } from "vitest";
import {
  ACOES,
  CHAVES,
  MODULOS,
  apenasExcecoes,
  copiarNiveis,
  mensagemSalvarPermissoes,
  niveisEfetivos,
  niveisPermitidos,
  nivelMaximo,
  nivelPadrao,
  rascunhoInicial,
  textoSalvarPermissoes,
} from "./modulos";
import { aplicarPermissoesMenu, destinoSemEdicao } from "./menu";
import { montarMenuRestaurantePiloto, type ContextoMenuRestaurante } from "@/lib/navegacao/menu-restaurante";

const tudoLigado: ContextoMenuRestaurante = {
  podeGerir: true,
  consolidadoVendasHabilitado: true,
  financeiroGerencialHabilitado: true,
  fichasTecnicasHabilitado: true,
  equipeHabilitado: true,
  garanteHabilitado: true,
  conciliacaoHabilitada: true,
};

describe("padrão do papel (sem linha = como hoje)", () => {
  it("master edita tudo", () => {
    for (const c of CHAVES) expect(nivelPadrao("master", true, c)).toBe("editar");
  });

  it("dono: tudo editar, Configurações só ver e Relatórios ver", () => {
    expect(nivelPadrao("gestao", true, "financeiro")).toBe("editar");
    expect(nivelPadrao("gestao", true, "configuracoes")).toBe("ver");
    expect(nivelPadrao("gestao", true, "relatorios")).toBe("ver");
  });

  it("gerente de loja não vê Configurações por padrão, mas pode receber ver", () => {
    expect(nivelPadrao("gestao", false, "configuracoes")).toBe("sem_acesso");
    expect(nivelMaximo("gestao", false, "configuracoes")).toBe("ver");
  });

  it("operacional: o que vê hoje", () => {
    expect(nivelPadrao("operacional", false, "estoque")).toBe("editar");
    expect(nivelPadrao("operacional", false, "financeiro")).toBe("editar");
    expect(nivelPadrao("operacional", false, "cardapio")).toBe("ver");
    expect(nivelPadrao("operacional", false, "equipe")).toBe("sem_acesso");
    expect(nivelPadrao("operacional", false, "cadastros")).toBe("sem_acesso");
    for (const a of ACOES) expect(nivelPadrao("operacional", false, a.chave)).toBe("sem_acesso");
  });

  it("sem exceção, o efetivo é o padrão", () => {
    const e = niveisEfetivos("gestao", false, {});
    for (const c of CHAVES) expect(e[c]).toBe(nivelPadrao("gestao", false, c));
  });
});

describe("exceções", () => {
  it("só restringem, menos Configurações ver para gestão", () => {
    expect(niveisEfetivos("operacional", false, { cardapio: "editar" }).cardapio).toBe("ver");
    expect(niveisEfetivos("gestao", false, { configuracoes: "editar" }).configuracoes).toBe("ver");
    expect(niveisEfetivos("gestao", false, { financeiro: "sem_acesso" }).financeiro).toBe("sem_acesso");
  });

  it("ação sensível cai junto com o módulo", () => {
    const e = niveisEfetivos("gestao", false, { financeiro: "ver" });
    expect(e["financeiro.apagar_lancamento"]).toBe("sem_acesso");
    expect(e["financeiro.fechar_mes"]).toBe("sem_acesso");
    expect(e["vendas.editar_dia_lancado"]).toBe("editar");
  });

  it("apenasExcecoes guarda só o que difere do padrão", () => {
    const tela = rascunhoInicial("gestao", false, {});
    expect(apenasExcecoes("gestao", false, { ...tela, financeiro: "ver" })).toEqual({ financeiro: "ver" });
  });

  it("módulo sem barreira no banco só aceita o padrão", () => {
    expect(niveisPermitidos("gestao", false, "estoque")).toEqual(["editar"]);
    expect(niveisPermitidos("gestao", false, "financeiro")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisPermitidos("operacional", false, "cardapio")).toEqual(["sem_acesso", "ver"]);
    expect(niveisPermitidos("gestao", false, "financeiro.fechar_mes")).toEqual(["sem_acesso", "editar"]);
  });
});

describe("Copiar de...", () => {
  it("ajusta ao teto de quem recebe", () => {
    const dono = niveisEfetivos("gestao", true, {});
    const copia = copiarNiveis({ role: "operacional", orgInteira: false }, dono);
    expect(copia.cardapio).toBe("ver");
    expect(copia.equipe).toBe("sem_acesso");
    expect(copia.configuracoes).toBe("sem_acesso");
  });

  it("leva as restrições da outra pessoa", () => {
    const origem = niveisEfetivos("gestao", false, { financeiro: "sem_acesso", vendas: "ver" });
    const copia = copiarNiveis({ role: "gestao", orgInteira: false }, origem);
    expect(copia.financeiro).toBe("sem_acesso");
    expect(copia.vendas).toBe("ver");
    expect(copia.estoque).toBe("editar");
  });
});

describe("botão Salvar diz o efeito", () => {
  it("lista as mudanças", () => {
    const antes = rascunhoInicial("gestao", false, {});
    expect(textoSalvarPermissoes("Ana", antes, antes)).toBe("Nada mudou");
    expect(textoSalvarPermissoes("Ana", antes, { ...antes, financeiro: "ver", vendas: "sem_acesso" })).toBe(
      "Salvar: Ana fica com Vendas sem acesso e Financeiro só ver",
    );
  });

  it("resume acima de 3", () => {
    const antes = rascunhoInicial("gestao", false, {});
    const depois = { ...antes, financeiro: "ver" as const, vendas: "ver" as const, cardapio: "ver" as const, equipe: "ver" as const };
    expect(textoSalvarPermissoes("Ana", antes, depois)).toMatch(/e mais 1$/);
  });

  it("resposta desconhecida do banco vira erro genérico", () => {
    expect(mensagemSalvarPermissoes("ok")).toBeNull();
    expect(mensagemSalvarPermissoes("xyz")).toBe("Não foi possível salvar as permissões.");
  });
});

describe("menu do piloto", () => {
  const menu = montarMenuRestaurantePiloto(tudoLigado);
  const rotulos = (p: Parameters<typeof aplicarPermissoesMenu>[1]) => aplicarPermissoesMenu(menu, p).map((i) => i.label);
  const hrefs = (p: Parameters<typeof aplicarPermissoesMenu>[1]) =>
    aplicarPermissoesMenu(menu, p).flatMap((i) => (i.sections ?? []).flatMap((s) => s.items.map((x) => x.href)));

  it("sem exceção o menu não muda", () => {
    expect(aplicarPermissoesMenu(menu, niveisEfetivos("gestao", true, {}))).toEqual(menu);
  });

  it("sem acesso tira o módulo; Início fica", () => {
    const r = rotulos(niveisEfetivos("gestao", false, { financeiro: "sem_acesso", relatorios: "sem_acesso" }));
    expect(r).not.toContain("Financeiro");
    expect(r).not.toContain("Relatórios");
    expect(r).toContain("Início");
  });

  it("ver tira as telas de trabalho", () => {
    const h = hrefs(niveisEfetivos("gestao", false, { financeiro: "ver", vendas: "ver" }));
    expect(h).not.toContain("/financeiro-gerencial/conciliacao");
    expect(h).not.toContain("/financeiro-gerencial/caixa-entrada");
    expect(h).not.toContain("/financeiro-gerencial/categorias");
    expect(h).not.toContain("/financeiro/consolidado/novo");
    expect(h).toContain("/financeiro-gerencial/lancamentos/despesas");
    const vendas = aplicarPermissoesMenu(menu, niveisEfetivos("gestao", false, { vendas: "ver" })).find((i) => i.label === "Vendas");
    expect(vendas?.href).toBe("/financeiro/consolidado");
  });

  it("rota de edição redireciona quem só vê", () => {
    const p = niveisEfetivos("gestao", false, { financeiro: "ver", cardapio: "ver" });
    expect(destinoSemEdicao("/financeiro-gerencial/fechamento", p)).toBe("/financeiro-gerencial/visao-geral");
    expect(destinoSemEdicao("/fichas-tecnicas/precificacao", p)).toBe("/fichas-tecnicas");
    expect(destinoSemEdicao("/financeiro-gerencial/dre", p)).toBeNull();
  });

  it("todo módulo do catálogo tem nome", () => {
    expect(MODULOS).toHaveLength(9);
  });
});
