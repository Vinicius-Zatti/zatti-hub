import { describe, expect, it } from "vitest";
import {
  avisoDesligar,
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
    for (const chave of ["vendas", "financeiro", "conciliacao", "cardapio", "garante", "extrato", "equipe"]) {
      expect(master[chave].alteravel, chave).toBe(true);
    }
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
