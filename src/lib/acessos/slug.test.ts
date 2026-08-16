import { describe, expect, it } from "vitest";
import {
  gerarIdComColisao,
  gerarIdOrganizacao,
  gerarIdUnidade,
  slugify,
  validarPapelVinculo,
} from "./slug";

describe("slugify", () => {
  it("remove acentos e vira kebab-case minúsculo", () => {
    expect(slugify("Restaurante Modelo")).toBe("restaurante-modelo");
    expect(slugify("Açaí & Cia LTDA")).toBe("acai-cia-ltda");
  });

  it("colapsa espaços/símbolos repetidos e tira hífen das pontas", () => {
    expect(slugify("  Restaurante   do -- Zé!!  ")).toBe("restaurante-do-ze");
  });

  it("nunca gera vazio, mesmo sem nenhum caractere aproveitável", () => {
    expect(slugify("!!!")).toBe("cliente");
    expect(slugify("")).toBe("cliente");
  });
});

describe("gerarIdOrganizacao / gerarIdUnidade", () => {
  it("unidade é prefixada pela organização, pra nunca colidir entre clientes diferentes", () => {
    const org = gerarIdOrganizacao("Restaurante Modelo");
    expect(org).toBe("restaurante-modelo");
    expect(gerarIdUnidade(org, "Centro")).toBe("restaurante-modelo-centro");
  });

  it("duas organizações com unidade de mesmo nome não colidem", () => {
    const orgA = gerarIdOrganizacao("Rede A");
    const orgB = gerarIdOrganizacao("Rede B");
    expect(gerarIdUnidade(orgA, "Centro")).not.toBe(gerarIdUnidade(orgB, "Centro"));
  });
});

describe("gerarIdComColisao", () => {
  it("gera o id quando não há colisão", () => {
    const r = gerarIdComColisao({
      candidato: "novo-cliente",
      idsExistentes: new Set(["outro-cliente"]),
      rotulo: "organização",
    });
    expect(r).toEqual({ ok: true, id: "novo-cliente" });
  });

  it("bloqueia com mensagem clara em vez de sobrescrever, quando o id já existe", () => {
    const r = gerarIdComColisao({
      candidato: "cliente-existente",
      idsExistentes: new Set(["cliente-existente"]),
      rotulo: "organização",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toContain("cliente-existente");
      expect(r.erro.toLowerCase()).toContain("nunca sobrescreve");
    }
  });
});

describe("validarPapelVinculo", () => {
  it("aceita gestao com unidade nula (organização inteira)", () => {
    const r = validarPapelVinculo({ role: "gestao", unidadeId: null });
    expect(r).toEqual({ ok: true, role: "gestao", unidadeId: null });
  });

  it("aceita gestao com unidade específica também", () => {
    const r = validarPapelVinculo({ role: "gestao", unidadeId: "org-a-centro" });
    expect(r).toEqual({ ok: true, role: "gestao", unidadeId: "org-a-centro" });
  });

  it("exige unidade específica para operacional", () => {
    const semUnidade = validarPapelVinculo({ role: "operacional", unidadeId: null });
    expect(semUnidade.ok).toBe(false);

    const comUnidade = validarPapelVinculo({ role: "operacional", unidadeId: "org-a-centro" });
    expect(comUnidade).toEqual({ ok: true, role: "operacional", unidadeId: "org-a-centro" });
  });

  it("nunca aceita papel master, mesmo que alguém force isso fora da tela", () => {
    const r = validarPapelVinculo({ role: "master", unidadeId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.toLowerCase()).toContain("master");
  });

  it("rejeita qualquer papel desconhecido (não confia no valor bruto do FormData)", () => {
    const r = validarPapelVinculo({ role: "admin-secreto", unidadeId: null });
    expect(r.ok).toBe(false);
  });
});
