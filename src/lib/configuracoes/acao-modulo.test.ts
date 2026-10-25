import { beforeEach, describe, expect, it, vi } from "vitest";

// Barreira de verdade de Configurações > Módulos: a action. `requireMaster` é
// simulado como o real (redireciona quem não é master); a escrita é
// `alterarFlagModulo`, compartilhada com /acessos.
const estado = vi.hoisted(() => ({ role: "master" as string, unidadeId: "zatti-burger" }));
const alterar = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acesso", () => ({
  requireMaster: vi.fn(async () => {
    if (estado.role !== "master") throw new Error("NEXT_REDIRECT /estoque/pedidos");
    return { role: "master", unidadeId: estado.unidadeId, organizacaoId: "org-burger", areaInterna: false };
  }),
}));
vi.mock("@/lib/acessos/alterar-flag", () => ({
  alterarFlagModulo: alterar,
  validarExtratoEstoque: () => () => null,
}));

const { definirModuloAction } = await import("@/app/(app)/configuracoes/actions");

beforeEach(() => {
  estado.role = "master";
  estado.unidadeId = "zatti-burger";
  alterar.mockReset();
  alterar.mockResolvedValue({ ok: true, mudou: true });
});

describe("definirModuloAction", () => {
  it("gestão (dono) e operacional não passam: requireMaster barra antes de gravar", async () => {
    for (const role of ["gestao", "operacional"]) {
      estado.role = role;
      await expect(definirModuloAction("garante", false)).rejects.toThrow("NEXT_REDIRECT");
    }
    expect(alterar).not.toHaveBeenCalled();
  });

  it("master desliga módulo da unidade da sessão, com auditoria", async () => {
    expect(await definirModuloAction("garante", false)).toEqual({ ok: true });
    expect(alterar).toHaveBeenCalledWith(
      expect.objectContaining({
        tabela: "unidades",
        id: "zatti-burger",
        coluna: "garante_habilitado",
        ligar: false,
        acaoDesligar: "desligar_modulo_garante",
      }),
    );
  });

  it("Equipe grava na organização da sessão; extrato mantém a ação de auditoria do /acessos", async () => {
    await definirModuloAction("equipe", true);
    expect(alterar).toHaveBeenLastCalledWith(
      expect.objectContaining({ tabela: "organizacoes", id: "org-burger", coluna: "equipe_habilitado" }),
    );
    await definirModuloAction("extrato", true);
    expect(alterar).toHaveBeenLastCalledWith(
      expect.objectContaining({ coluna: "extrato_estoque_habilitado", acaoLigar: "ligar_extrato_estoque" }),
    );
  });

  it("recusa chave inválida, Estoque (sem chave) e unidade fora do piloto", async () => {
    expect(await definirModuloAction("unidades", true)).toEqual({ erro: "Pedido inválido." });
    expect("erro" in (await definirModuloAction("estoque", false))).toBe(true);
    estado.unidadeId = "outra-unidade";
    expect("erro" in (await definirModuloAction("garante", true))).toBe(true);
    expect(alterar).not.toHaveBeenCalled();
  });

  it("erro do banco volta para a tela", async () => {
    alterar.mockResolvedValue({ erro: "falhou" });
    expect(await definirModuloAction("vendas", true)).toEqual({ erro: "falhou" });
  });
});
