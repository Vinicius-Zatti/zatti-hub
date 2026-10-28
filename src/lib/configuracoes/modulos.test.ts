import { describe, expect, it } from "vitest";
import {
  avisoDesligar,
  avisoLigarContagemPorSetor,
  bloqueioContagemPorSetor,
  definicaoModulo,
  ehChaveModulo,
  estadoDosModulos,
  MODULOS,
  type FlagsModulos,
} from "./modulos";

const tudoLigado: FlagsModulos = {
  consolidado_vendas_habilitado: true,
  financeiro_gerencial_habilitado: true,
  financeiro_liberado_equipe: true,
  conciliacao_habilitada: true,
  fichas_tecnicas_habilitado: true,
  garante_habilitado: true,
  extrato_estoque_habilitado: true,
  contagem_por_setor_habilitada: true,
  equipe_habilitado: true,
  fonteEstoqueNoBanco: true,
};

const porChave = (flags: Partial<FlagsModulos>, master: boolean) =>
  Object.fromEntries(estadoDosModulos({ ...tudoLigado, ...flags }, master).map((m) => [m.chave, m]));

describe("Configurações > Módulos", () => {
  it("lista todos os módulos, na ordem, com o que cada um faz", () => {
    expect(MODULOS.map((m) => m.chave)).toEqual([
      "estoque",
      "vendas",
      "financeiro",
      "conciliacao",
      "cardapio",
      "garante",
      "extrato",
      "contagem_setor",
      "equipe",
    ]);
    for (const m of MODULOS) expect(m.descricao.length).toBeGreaterThan(20);
  });

  it("estado segue a chave do banco; Estoque e Compras sempre ligado", () => {
    const m = porChave({ consolidado_vendas_habilitado: false, garante_habilitado: false, equipe_habilitado: false }, true);
    expect(m.estoque.ligado).toBe(true);
    expect(m.vendas.ligado).toBe(false);
    expect(m.garante.ligado).toBe(false);
    expect(m.equipe.ligado).toBe(false);
    expect(m.financeiro.ligado).toBe(true);
  });

  it("só master altera; dono (gestão) nunca tem botão", () => {
    const dono = estadoDosModulos(tudoLigado, false);
    expect(dono.every((m) => !m.alteravel)).toBe(true);
    const master = porChave({}, true);
    expect(master.estoque.alteravel).toBe(false);
    for (const chave of ["vendas", "financeiro", "conciliacao", "cardapio", "garante", "extrato", "contagem_setor", "equipe"]) {
      expect(master[chave].alteravel, chave).toBe(true);
    }
  });

  it("Contagem por setor: dono e gestão também trocam; os outros módulos seguem só master", () => {
    const gestao = Object.fromEntries(estadoDosModulos(tudoLigado, false, true).map((m) => [m.chave, m]));
    expect(gestao.contagem_setor.alteravel).toBe(true);
    for (const chave of ["vendas", "financeiro", "conciliacao", "cardapio", "garante", "extrato", "equipe"]) {
      expect(gestao[chave].alteravel, chave).toBe(false);
    }
    // Sem o papel de gestão (operacional nem chega à tela), nada.
    expect(estadoDosModulos(tudoLigado, false, false).find((m) => m.chave === "contagem_setor")?.alteravel).toBe(false);
  });

  it("Contagem por setor na planilha: não liga, só desliga", () => {
    const m = porChave({ fonteEstoqueNoBanco: false, contagem_por_setor_habilitada: false }, true).contagem_setor;
    expect(m.alteravel).toBe(false);
    expect(m.observacao).toMatch(/planilha/);
  });

  it("Contagem por setor: desligar com contagem em andamento fica travado, com o motivo", () => {
    const situacaoSetor = { produtosSemSetor: 3, setoresAtivos: 2, emAndamento: ["27/10/2026"] };
    const ligada = porChave({ situacaoSetor }, false).contagem_setor;
    expect(ligada.bloqueio).toBe(
      "Há contagem por setor em andamento (27/10/2026). Envie todos os setores dessa data antes de desligar.",
    );
    // Desligada, a data aberta de antes da chave não prende a unidade: ligar segue livre.
    const desligada = porChave({ situacaoSetor, contagem_por_setor_habilitada: false }, false).contagem_setor;
    expect(desligada.bloqueio).toBeUndefined();
    expect(bloqueioContagemPorSetor(true, [])).toBeUndefined();
    expect(bloqueioContagemPorSetor(true, ["20/10/2026", "27/10/2026"])).toContain("dessas datas");
  });

  it("Contagem por setor: ao ligar, avisa quantos produtos ficam fora e leva para Setores", () => {
    const situacaoSetor = { produtosSemSetor: 12, setoresAtivos: 2, emAndamento: [] };
    const m = porChave({ situacaoSetor, contagem_por_setor_habilitada: false }, false).contagem_setor;
    expect(m.avisoLigar).toEqual({
      texto: "12 produtos sem setor ficam fora da contagem até você designar.",
      link: { href: "/estoque/setores", rotulo: "Ir para Setores" },
    });
    expect(avisoLigarContagemPorSetor({ produtosSemSetor: 1, setoresAtivos: 1 }).texto).toBe(
      "1 produto sem setor fica fora da contagem até você designar.",
    );
    expect(avisoLigarContagemPorSetor({ produtosSemSetor: 5, setoresAtivos: 0 }).texto).toMatch(/não há setor ativo/);
    expect(avisoDesligar(definicaoModulo("contagem_setor"))).toMatch(/volta a ser sem setor/);
  });

  it("extrato na planilha: master não liga (só desliga, se estiver ligado) e vê o motivo", () => {
    const desligado = porChave({ fonteEstoqueNoBanco: false, extrato_estoque_habilitado: false }, true).extrato;
    expect(desligado.alteravel).toBe(false);
    expect(desligado.observacao).toMatch(/planilha/);
    expect(porChave({ fonteEstoqueNoBanco: false }, true).extrato.alteravel).toBe(true);
  });

  it("Financeiro ligado mas fechado para a equipe avisa; Conciliação sem Financeiro avisa", () => {
    expect(porChave({ financeiro_liberado_equipe: false }, false).financeiro.observacao).toMatch(/só a Zatti/);
    const m = porChave({ financeiro_gerencial_habilitado: false, conciliacao_habilitada: false }, true);
    expect(m.conciliacao.observacao).toBe("Precisa do Financeiro ligado.");
  });

  it("aviso de desligar diz o alcance e que nada é apagado", () => {
    expect(avisoDesligar(definicaoModulo("garante"))).toBe(
      "As telas de Garante somem para toda a equipe desta unidade; nenhum dado é apagado.",
    );
    expect(avisoDesligar(definicaoModulo("equipe"))).toContain("desta organização");
  });

  it("chave inválida vinda do cliente é recusada", () => {
    expect(ehChaveModulo("garante")).toBe(true);
    expect(ehChaveModulo("pre_preparo")).toBe(false);
    expect(ehChaveModulo(undefined)).toBe(false);
    expect(ehChaveModulo("unidades")).toBe(false);
  });
});
