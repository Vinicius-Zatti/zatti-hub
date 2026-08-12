import { describe, expect, it, vi } from "vitest";
import { ErroPublico, paraErroPublico } from "./erros";

describe("paraErroPublico", () => {
  it("deixa passar a mensagem de um ErroPublico (curada de propósito)", () => {
    const erro = new ErroPublico("Já existe um fornecedor cadastrado com esse nome.");
    expect(paraErroPublico(erro, "teste")).toBe("Já existe um fornecedor cadastrado com esse nome.");
  });

  it("nunca deixa vazar .message de um Error genérico (ex: erro cru do Postgres/Sheets)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = new Error("relation \"produtos\" violates foreign key constraint fk_unidade_id");
    const mensagem = paraErroPublico(erro, "teste");
    expect(mensagem).not.toContain("produtos");
    expect(mensagem).not.toContain("foreign key");
    expect(mensagem).toBe("Não foi possível concluir a ação agora. Tenta de novo em instantes.");
    spy.mockRestore();
  });

  it("nunca deixa vazar valor não-Error (string, objeto) lançado por engano", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mensagem = paraErroPublico({ segredo: "token-de-sessao-xyz" }, "teste");
    expect(mensagem).not.toContain("token-de-sessao-xyz");
    spy.mockRestore();
  });

  it("loga o erro real no servidor mesmo genericizando a resposta", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    paraErroPublico(new Error("detalhe interno"), "contexto-x");
    expect(spy).toHaveBeenCalledWith("[contexto-x]", "detalhe interno");
    spy.mockRestore();
  });
});
