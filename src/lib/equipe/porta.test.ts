import { describe, expect, it } from "vitest";
import { validarPedidoPorta } from "./porta";

const VINCULO = "11111111-2222-3333-4444-555555555555";

describe("validarPedidoPorta", () => {
  it("aceita cadastrar gestão da organização inteira", () => {
    const r = validarPedidoPorta({
      acao: "cadastrar",
      organizacao_id: "the-house",
      nome: " Ana ",
      email: "ana@exemplo.com",
      whatsapp: "31 99999-8888",
      role: "gestao",
    });
    expect(r).toEqual({
      ok: true,
      pedido: {
        acao: "cadastrar",
        organizacaoId: "the-house",
        nome: "Ana",
        email: "ana@exemplo.com",
        whatsapp: "31 99999-8888",
        role: "gestao",
        unidadeId: null,
      },
    });
  });

  it("nunca deixa pedir master", () => {
    expect(validarPedidoPorta({ acao: "cadastrar", organizacao_id: "x", nome: "A", email: "a@b.c", whatsapp: "1", role: "master" }))
      .toEqual({ ok: false, erro: "papel_invalido" });
    expect(validarPedidoPorta({ acao: "editar", organizacao_id: "x", vinculo_id: VINCULO, role: "master" }))
      .toEqual({ ok: false, erro: "papel_invalido" });
  });

  it("recusa organização e unidade com formato estranho", () => {
    expect(validarPedidoPorta({ acao: "listar", organizacao_id: "../x" })).toEqual({ ok: false, erro: "organizacao_invalida" });
    expect(validarPedidoPorta({ acao: "listar" })).toEqual({ ok: false, erro: "organizacao_invalida" });
    expect(
      validarPedidoPorta({ acao: "editar", organizacao_id: "x", vinculo_id: VINCULO, role: "operacional", unidade_id: "a b" }),
    ).toEqual({ ok: false, erro: "unidade_invalida" });
  });

  it("revogar e reativar pedem um vínculo válido", () => {
    expect(validarPedidoPorta({ acao: "revogar", organizacao_id: "x", vinculo_id: "1" })).toEqual({ ok: false, erro: "vinculo_invalido" });
    expect(validarPedidoPorta({ acao: "reativar", organizacao_id: "x", vinculo_id: VINCULO })).toEqual({
      ok: true,
      pedido: { acao: "reativar", organizacaoId: "x", vinculoId: VINCULO },
    });
  });

  it("renomear pede vínculo e nome", () => {
    expect(validarPedidoPorta({ acao: "renomear", organizacao_id: "x", vinculo_id: VINCULO, nome: " Ana " })).toEqual({
      ok: true,
      pedido: { acao: "renomear", organizacaoId: "x", vinculoId: VINCULO, nome: "Ana" },
    });
    expect(validarPedidoPorta({ acao: "renomear", organizacao_id: "x", vinculo_id: VINCULO, nome: "  " })).toEqual({ ok: false, erro: "nome_invalido" });
  });

  it("whatsapp pede vínculo e número", () => {
    expect(validarPedidoPorta({ acao: "whatsapp", organizacao_id: "x", vinculo_id: VINCULO, whatsapp: "31 98589-1038" })).toEqual({
      ok: true,
      pedido: { acao: "whatsapp", organizacaoId: "x", vinculoId: VINCULO, whatsapp: "31 98589-1038" },
    });
    expect(validarPedidoPorta({ acao: "whatsapp", organizacao_id: "x", vinculo_id: VINCULO })).toEqual({ ok: false, erro: "whatsapp_invalido" });
  });

  it("recusa ação desconhecida e corpo que não é objeto", () => {
    expect(validarPedidoPorta({ acao: "apagar", organizacao_id: "x" })).toEqual({ ok: false, erro: "acao_invalida" });
    expect(validarPedidoPorta([1])).toEqual({ ok: false, erro: "corpo_invalido" });
    expect(validarPedidoPorta(null)).toEqual({ ok: false, erro: "corpo_invalido" });
  });
});
