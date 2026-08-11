import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["x-forwarded-for", "203.0.113.10, 10.0.0.1"]])),
}));

// Importa depois dos mocks acima, pra `rate-limit.ts` já pegar as versões mockadas.
const { exigirLimite, chaveUsuario, obterIp } = await import("./rate-limit");
const { ErroPublico } = await import("./erros");

describe("exigirLimite - fail closed (barreira de segurança, não pode falhar aberta)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("libera quando a RPC confirma que está dentro do limite", async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    await expect(exigirLimite(chaveUsuario("user-1"), "escrita_padrao")).resolves.toBeUndefined();
  });

  it("bloqueia quando a RPC confirma que estourou o limite", async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null });
    await expect(exigirLimite(chaveUsuario("user-1"), "escrita_padrao")).rejects.toBeInstanceOf(ErroPublico);
  });

  it("bloqueia (não libera) quando a RPC devolve erro - fail closed", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "relation does not exist" } });
    await expect(exigirLimite(chaveUsuario("user-1"), "escrita_padrao")).rejects.toBeInstanceOf(ErroPublico);
  });

  it("bloqueia (não libera) quando a chamada lança exceção - fail closed", async () => {
    rpcMock.mockRejectedValueOnce(new Error("network error"));
    await expect(exigirLimite(chaveUsuario("user-1"), "escrita_padrao")).rejects.toBeInstanceOf(ErroPublico);
  });

  it("chama a RPC com os parâmetros da regra certa pra cada ação", async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    await exigirLimite(chaveUsuario("user-1"), "sugerir_sku");
    expect(rpcMock).toHaveBeenCalledWith("checar_rate_limit", {
      p_chave: "user:user-1",
      p_acao: "sugerir_sku",
      p_limite: 20,
      p_janela_segundos: 3600,
    });
  });
});

describe("obterIp", () => {
  it("pega o primeiro IP de x-forwarded-for", async () => {
    expect(await obterIp()).toBe("203.0.113.10");
  });
});
