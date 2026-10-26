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
  rank,
  rascunhoInicial,
  restringirPorVinculos,
  textoSalvarPermissoes,
} from "./modulos";
import { podeMexerNaContaDe, podeMudarPermissoesDe } from "./quem-administra";
import { aplicarPermissoesMenu, destinoSemEdicao, moduloDaRotaEstoque } from "./menu";
import { ehDonoDaOrganizacao, vinculoEhDono } from "./dono";
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

  it("todo módulo já tem barreira no banco (Estoque, Garante e Cadastros desde 26/10)", () => {
    expect(MODULOS.every((m) => m.liberado)).toBe(true);
    expect(niveisPermitidos("gestao", false, "estoque")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisPermitidos("gestao", false, "garante")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisPermitidos("gestao", false, "cadastros")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisPermitidos("operacional", false, "estoque")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisPermitidos("operacional", false, "cadastros")).toEqual(["sem_acesso"]);
    expect(niveisPermitidos("gestao", false, "financeiro")).toEqual(["sem_acesso", "ver", "editar"]);
    expect(niveisPermitidos("gestao", false, "financeiro.fechar_mes")).toEqual(["sem_acesso", "editar"]);
  });
});

describe("chef no Cardápio (26/10/2026)", () => {
  it("fica entre ver e editar", () => {
    expect(rank("ver")).toBeLessThan(rank("chef"));
    expect(rank("chef")).toBeLessThan(rank("editar"));
  });

  it("só existe no Cardápio", () => {
    expect(niveisPermitidos("operacional", false, "cardapio")).toEqual(["sem_acesso", "ver", "chef"]);
    expect(niveisPermitidos("gestao", false, "cardapio")).toEqual(["sem_acesso", "ver", "chef", "editar"]);
    expect(niveisPermitidos("gestao", false, "vendas")).not.toContain("chef");
  });

  it("a operação só vira chef quando foi escolhido (editar não vira chef sozinho)", () => {
    expect(niveisEfetivos("operacional", false, { cardapio: "chef" }).cardapio).toBe("chef");
    expect(niveisEfetivos("operacional", false, { cardapio: "editar" }).cardapio).toBe("ver");
    expect(niveisEfetivos("gestao", false, { cardapio: "chef" }).cardapio).toBe("chef");
    expect(apenasExcecoes("operacional", false, { cardapio: "chef" })).toEqual({ cardapio: "chef" });
  });

  it("copiar de um chef leva o chef", () => {
    const chef = niveisEfetivos("operacional", false, { cardapio: "chef" });
    expect(copiarNiveis({ role: "operacional", ehDono: false }, chef).cardapio).toBe("chef");
    expect(copiarNiveis({ role: "gestao", ehDono: false }, chef).cardapio).toBe("chef");
  });

  it("o botão Salvar diz chef", () => {
    const antes = rascunhoInicial("operacional", false, {});
    expect(textoSalvarPermissoes("Bia", antes, { ...antes, cardapio: "chef" })).toBe("Salvar: Bia fica com Cardápio chef");
  });

  it("chef não abre Margem Ideal nem Precificação", () => {
    const chef = niveisEfetivos("gestao", false, { cardapio: "chef" });
    expect(destinoSemEdicao("/fichas-tecnicas/calculadora", chef)).toBe("/fichas-tecnicas");
    expect(destinoSemEdicao("/fichas-tecnicas/precificacao", chef)).toBe("/fichas-tecnicas");
    expect(destinoSemEdicao("/fichas-tecnicas", chef)).toBeNull();
  });
});

describe("Copiar de...", () => {
  it("ajusta ao teto de quem recebe", () => {
    const dono = niveisEfetivos("gestao", true, {});
    const copia = copiarNiveis({ role: "operacional", ehDono: false }, dono);
    expect(copia.cardapio).toBe("ver");
    expect(copia.equipe).toBe("sem_acesso");
    expect(copia.configuracoes).toBe("sem_acesso");
  });

  it("leva as restrições da outra pessoa", () => {
    const origem = niveisEfetivos("gestao", false, { financeiro: "sem_acesso", vendas: "ver" });
    const copia = copiarNiveis({ role: "gestao", ehDono: false }, origem);
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

  it("Estoque, Garante e Cadastros: ver tira as telas de gravar", () => {
    const p = niveisEfetivos("gestao", false, { estoque: "ver", garante: "ver", cadastros: "ver" });
    expect(destinoSemEdicao("/estoque/contagem", p)).toBe("/estoque/contagem/visualizacao");
    expect(destinoSemEdicao("/estoque/pedidos/cotacoes", p)).toBe("/estoque/contagem/visualizacao");
    expect(destinoSemEdicao("/estoque/contagem/visualizacao", p)).toBeNull();
    expect(destinoSemEdicao("/garante/modelos", p)).toBe("/garante");
    expect(destinoSemEdicao("/estoque/produtos/edicao", p)).toBe("/cadastros");
    const h = hrefs(p);
    expect(h).not.toContain("/estoque/contagem");
    expect(h).toContain("/estoque/contagem/visualizacao");
    expect(h).not.toContain("/estoque/setores");
  });

  it("sem acesso no Estoque, Garante ou Cadastros tira o módulo", () => {
    const r = rotulos(niveisEfetivos("gestao", false, { estoque: "sem_acesso", garante: "sem_acesso", cadastros: "sem_acesso" }));
    expect(r).not.toContain("Estoque");
    expect(r).not.toContain("Garante");
    expect(r).not.toContain("Cadastros");
  });

  it("telas de cadastro dentro de /estoque seguem Cadastros", () => {
    expect(moduloDaRotaEstoque("/estoque/produtos/edicao")).toBe("cadastros");
    expect(moduloDaRotaEstoque("/estoque/fornecedores")).toBe("cadastros");
    expect(moduloDaRotaEstoque("/estoque/setores")).toBe("cadastros");
    expect(moduloDaRotaEstoque("/estoque/produtos")).toBe("estoque");
    expect(moduloDaRotaEstoque("/estoque/contagem/perdas")).toBe("estoque");
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

describe("dois vínculos e dono", () => {
  it("a restrição de qualquer vínculo vence", () => {
    const base = niveisEfetivos("gestao", true, {});
    const r = restringirPorVinculos(base, [{}, { financeiro: "sem_acesso" }]);
    expect(r.financeiro).toBe("sem_acesso");
    expect(r["financeiro.apagar_lancamento"]).toBe("sem_acesso");
    expect(r.vendas).toBe("editar");
  });

  it("exceção nunca sobe o nível pelo outro vínculo", () => {
    const base = niveisEfetivos("gestao", false, {});
    expect(restringirPorVinculos(base, [{ configuracoes: "ver" }]).configuracoes).toBe("sem_acesso");
  });

  it("as permissões do dono só o master muda", () => {
    expect(podeMudarPermissoesDe({ role: "gestao" }, { ehDono: true })).toBe(false);
    expect(podeMudarPermissoesDe({ role: "gestao" }, { ehDono: false })).toBe(true);
    expect(podeMudarPermissoesDe({ role: "master" }, { ehDono: true })).toBe(true);
  });

  it("a conta do titular só o master mexe", () => {
    expect(podeMexerNaContaDe({ role: "gestao" }, { ehTitular: true })).toBe(false);
    expect(podeMexerNaContaDe({ role: "gestao" }, { ehTitular: false })).toBe(true);
    expect(podeMexerNaContaDe({ role: "master" }, { ehTitular: true })).toBe(true);
  });
});

describe("titular e reserva (26/10/2026)", () => {
  const vinculos = [
    { id: "v1", role: "gestao", unidade_id: null },
    { id: "v2", role: "gestao", unidade_id: "loja" },
  ];

  it("sem titular marcado, a gestão da organização inteira é dona (como antes)", () => {
    expect(ehDonoDaOrganizacao({ ehMaster: false, titularVinculoId: null, vinculosDaOrg: vinculos, vinculoBase: vinculos[0] }))
      .toEqual({ ehDono: true, ehTitular: false });
    expect(
      ehDonoDaOrganizacao({ ehMaster: false, titularVinculoId: null, vinculosDaOrg: [vinculos[1]], vinculoBase: vinculos[1] }).ehDono,
    ).toBe(false);
  });

  it("com titular, só ele é dono, mesmo preso a uma loja", () => {
    expect(ehDonoDaOrganizacao({ ehMaster: false, titularVinculoId: "v2", vinculosDaOrg: [vinculos[1]], vinculoBase: vinculos[1] }))
      .toEqual({ ehDono: true, ehTitular: true });
    expect(ehDonoDaOrganizacao({ ehMaster: false, titularVinculoId: "v9", vinculosDaOrg: [vinculos[0]], vinculoBase: vinculos[0] }))
      .toEqual({ ehDono: false, ehTitular: false });
  });

  it("master nunca é dono (administra por ser master)", () => {
    expect(ehDonoDaOrganizacao({ ehMaster: true, titularVinculoId: null, vinculosDaOrg: [], vinculoBase: null }).ehDono).toBe(false);
  });

  it("na Equipe, cada vínculo segue a mesma regra", () => {
    const base = { role: "gestao", status: "ativo" };
    expect(vinculoEhDono({ ...base, id: "a", unidadeId: null }, null)).toBe(true);
    expect(vinculoEhDono({ ...base, id: "a", unidadeId: null }, "b")).toBe(false);
    expect(vinculoEhDono({ ...base, id: "b", unidadeId: "loja" }, "b")).toBe(true);
    expect(vinculoEhDono({ id: "c", role: "operacional", status: "ativo", unidadeId: "loja" }, "c")).toBe(false);
    expect(vinculoEhDono({ id: "a", role: "gestao", status: "revogado", unidadeId: null }, null)).toBe(false);
  });

  it("Configurações: padrão só para o dono", () => {
    expect(nivelPadrao("gestao", true, "configuracoes")).toBe("ver");
    expect(nivelPadrao("gestao", false, "configuracoes")).toBe("sem_acesso");
  });
});
