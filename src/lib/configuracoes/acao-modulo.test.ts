import { beforeEach, describe, expect, it, vi } from "vitest";

// Barreira de verdade de Configurações > Módulos: a action. `requireMaster` é
// simulado como o real (redireciona quem não é master); a escrita é
// `alterarFlagModulo`, compartilhada com /acessos.
const estado = vi.hoisted(() => ({ role: "master" as string, unidadeId: "zatti-burger", areaInterna: false }));
const alterar = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const auditoria = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acesso", () => ({
  requireMaster: vi.fn(async () => {
    if (estado.role !== "master") throw new Error("NEXT_REDIRECT /estoque/pedidos");
    return { role: "master", unidadeId: estado.unidadeId, organizacaoId: "org-burger", areaInterna: estado.areaInterna };
  }),
  registrarAuditoria: auditoria,
}));
// Barreira de Configurações (master, dono ou gestão que vê; operacional volta ao Início).
vi.mock("@/app/(app)/configuracoes/acesso", () => ({
  requireConfiguracoes: vi.fn(async () => {
    if (estado.role === "operacional") throw new Error("NEXT_REDIRECT /painel");
    return { role: estado.role, unidadeId: estado.unidadeId, organizacaoId: "org-burger", areaInterna: estado.areaInterna };
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/acessos/alterar-flag", () => ({
  alterarFlagModulo: alterar,
  validarExtratoEstoque: () => () => null,
}));

const { definirModuloAction } = await import("@/app/(app)/configuracoes/actions");

beforeEach(() => {
  estado.role = "master";
  estado.unidadeId = "zatti-burger";
  estado.areaInterna = false;
  alterar.mockReset();
  alterar.mockResolvedValue({ ok: true, mudou: true });
  rpc.mockReset();
  rpc.mockResolvedValue({ data: true, error: null });
  auditoria.mockReset();
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

  it("recusa chave inválida, Estoque (sem chave) e área interna", async () => {
    expect(await definirModuloAction("unidades", true)).toEqual({ erro: "Pedido inválido." });
    expect("erro" in (await definirModuloAction("estoque", false))).toBe(true);
    estado.areaInterna = true;
    expect("erro" in (await definirModuloAction("garante", true))).toBe(true);
    expect(alterar).not.toHaveBeenCalled();
  });

  it("erro do banco volta para a tela", async () => {
    alterar.mockResolvedValue({ erro: "falhou" });
    expect(await definirModuloAction("vendas", true)).toEqual({ erro: "falhou" });
  });
});

describe("definirModuloAction - Contagem por setor (dono e gestão também trocam)", () => {
  it("gestão (dono) e master ligam pela função do banco, na unidade da sessão, com auditoria", async () => {
    for (const role of ["gestao", "master"]) {
      estado.role = role;
      rpc.mockClear();
      auditoria.mockClear();
      expect(await definirModuloAction("contagem_setor", true)).toEqual({ ok: true });
      expect(rpc).toHaveBeenCalledWith("definir_contagem_por_setor", { p_unidade_id: "zatti-burger", p_ligar: true });
      expect(auditoria).toHaveBeenCalledWith(
        expect.objectContaining({ acao: "ligar_modulo_contagem_setor", entidadeId: "zatti-burger" }),
      );
    }
    // Não passa pelo caminho só-master dos outros módulos.
    expect(alterar).not.toHaveBeenCalled();
  });

  it("operacional não passa", async () => {
    estado.role = "operacional";
    await expect(definirModuloAction("contagem_setor", true)).rejects.toThrow("NEXT_REDIRECT");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("com contagem em andamento o banco recusa e o motivo volta para a tela, sem auditoria", async () => {
    estado.role = "gestao";
    const motivo =
      "Há contagem por setor em andamento (27/10/2026). Envie todos os setores dessa data antes de trocar o modo da contagem.";
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: motivo } });
    expect(await definirModuloAction("contagem_setor", false)).toEqual({ erro: motivo });
    expect(auditoria).not.toHaveBeenCalled();
  });

  it("sem mudança (já estava assim) não grava auditoria; permissão negada no banco vira frase", async () => {
    estado.role = "gestao";
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await definirModuloAction("contagem_setor", true)).toEqual({ ok: true });
    expect(auditoria).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    expect(await definirModuloAction("contagem_setor", true)).toEqual({
      erro: "Sem permissão para trocar o modo da contagem nesta unidade.",
    });
  });
});
