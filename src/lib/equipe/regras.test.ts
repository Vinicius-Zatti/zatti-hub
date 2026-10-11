import { describe, expect, it } from "vitest";
import {
  gerarSenhaTemporaria,
  normalizarWhatsapp,
  ordenarVinculos,
  podeAdministrarVinculo,
  podeUsarEquipe,
  validarConcessao,
} from "./regras";

describe("normalizarWhatsapp", () => {
  it("aceita celular brasileiro com ou sem DDI e máscara", () => {
    expect(normalizarWhatsapp("31 99999-8888")).toBe("+5531999998888");
    expect(normalizarWhatsapp("(31) 99999-8888")).toBe("+5531999998888");
    expect(normalizarWhatsapp("+55 31 99999-8888")).toBe("+5531999998888");
    expect(normalizarWhatsapp("5531999998888")).toBe("+5531999998888");
  });
  it("aceita fixo de 10 dígitos e internacional com +", () => {
    expect(normalizarWhatsapp("31 3333-4444")).toBe("+553133334444");
    expect(normalizarWhatsapp("+351 912 345 678")).toBe("+351912345678");
  });
  it("recusa o que não dá pra confiar", () => {
    expect(normalizarWhatsapp("")).toBeNull();
    expect(normalizarWhatsapp("99999-8888")).toBeNull();
    expect(normalizarWhatsapp("31 89999-8888")).toBeNull();
    expect(normalizarWhatsapp("01 99999-8888")).toBeNull();
    expect(normalizarWhatsapp("abc")).toBeNull();
  });
});

describe("gerarSenhaTemporaria", () => {
  it("tem 12 caracteres, sem ambíguos, e não repete", () => {
    const senhas = new Set(Array.from({ length: 200 }, () => gerarSenhaTemporaria()));
    expect(senhas.size).toBe(200);
    for (const s of senhas) {
      expect(s).toHaveLength(12);
      expect(s).not.toMatch(/[0O1lI]/);
    }
  });
});

const unidades = new Set(["org-a-centro", "org-a-sul"]);

describe("validarConcessao", () => {
  const gestaoTodas = { role: "gestao" as const, unidadeFixa: null };
  const gestaoCentro = { role: "gestao" as const, unidadeFixa: "org-a-centro" };

  it("nunca concede master", () => {
    const r = validarConcessao({ concedente: gestaoTodas, role: "master", unidadeId: null, unidadesDaOrganizacao: unidades });
    expect(r.ok).toBe(false);
  });
  it("operacional não concede nada", () => {
    const r = validarConcessao({
      concedente: { role: "operacional", unidadeFixa: "org-a-centro" },
      role: "operacional",
      unidadeId: "org-a-centro",
      unidadesDaOrganizacao: unidades,
    });
    expect(r.ok).toBe(false);
  });
  it("operacional exige unidade", () => {
    expect(validarConcessao({ concedente: gestaoTodas, role: "operacional", unidadeId: null, unidadesDaOrganizacao: unidades }).ok).toBe(false);
  });
  it("recusa unidade de outro cliente", () => {
    expect(validarConcessao({ concedente: gestaoTodas, role: "operacional", unidadeId: "org-b-loja", unidadesDaOrganizacao: unidades }).ok).toBe(false);
  });
  it("gestão da organização concede gestão de todas as unidades", () => {
    expect(validarConcessao({ concedente: gestaoTodas, role: "gestao", unidadeId: null, unidadesDaOrganizacao: unidades })).toEqual({
      ok: true,
      role: "gestao",
      unidadeId: null,
    });
  });
  it("gestão de unidade só concede a própria unidade, nunca todas", () => {
    expect(validarConcessao({ concedente: gestaoCentro, role: "gestao", unidadeId: null, unidadesDaOrganizacao: unidades }).ok).toBe(false);
    expect(validarConcessao({ concedente: gestaoCentro, role: "operacional", unidadeId: "org-a-sul", unidadesDaOrganizacao: unidades }).ok).toBe(false);
    expect(validarConcessao({ concedente: gestaoCentro, role: "operacional", unidadeId: "org-a-centro", unidadesDaOrganizacao: unidades }).ok).toBe(true);
  });
});

describe("podeAdministrarVinculo", () => {
  const gestor = { role: "gestao" as const, unidadeFixa: null, userId: "u-gestor", organizacaoId: "org-a" };
  const alvo = { userId: "u-op", organizacaoId: "org-a", unidadeId: "org-a-centro", role: "operacional" };

  it("administra a equipe do próprio cliente", () => {
    expect(podeAdministrarVinculo({ concedente: gestor, alvo })).toBe(true);
  });
  it("nunca master, nunca o próprio, nunca outro cliente", () => {
    expect(podeAdministrarVinculo({ concedente: gestor, alvo: { ...alvo, role: "master" } })).toBe(false);
    expect(podeAdministrarVinculo({ concedente: gestor, alvo: { ...alvo, userId: "u-gestor" } })).toBe(false);
    expect(podeAdministrarVinculo({ concedente: gestor, alvo: { ...alvo, organizacaoId: "org-b" } })).toBe(false);
  });
  it("gestão de unidade só administra a própria unidade", () => {
    const deUnidade = { ...gestor, unidadeFixa: "org-a-sul" };
    expect(podeAdministrarVinculo({ concedente: deUnidade, alvo })).toBe(false);
    expect(podeAdministrarVinculo({ concedente: deUnidade, alvo: { ...alvo, unidadeId: null } })).toBe(false);
  });
});

describe("podeUsarEquipe", () => {
  it("flag desligada fecha para todos, inclusive master", () => {
    expect(podeUsarEquipe({ role: "master", equipeHabilitado: false })).toBe(false);
    expect(podeUsarEquipe({ role: "gestao", equipeHabilitado: false })).toBe(false);
  });
  it("flag ligada abre só para gestão e master", () => {
    expect(podeUsarEquipe({ role: "gestao", equipeHabilitado: true })).toBe(true);
    expect(podeUsarEquipe({ role: "master", equipeHabilitado: true })).toBe(true);
    expect(podeUsarEquipe({ role: "operacional", equipeHabilitado: true })).toBe(false);
  });
});

describe("ordenarVinculos", () => {
  it("gestão antes de operacional, organização inteira antes de unidade, mais antigo, id", () => {
    const ordem = ordenarVinculos([
      { id: "4", role: "operacional", unidade_id: "x", created_at: "2026-01-01" },
      { id: "3", role: "gestao", unidade_id: "x", created_at: "2026-01-01" },
      { id: "2", role: "gestao", unidade_id: null, created_at: "2026-02-01" },
      { id: "1", role: "gestao", unidade_id: null, created_at: "2026-02-01" },
    ]).map((v) => v.id);
    expect(ordem).toEqual(["1", "2", "3", "4"]);
  });
});
