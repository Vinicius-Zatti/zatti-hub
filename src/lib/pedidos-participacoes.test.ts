import { describe, expect, it, vi } from "vitest";

// Leitura de `cotacao_participacoes`: paginada, filtrada por SKU quando pedido,
// e vazia (tela como antes) enquanto a migration não foi aplicada.

const estado = vi.hoisted(() => ({
  resposta: [] as { data: unknown; error: { code?: string; message: string } | null }[],
  filtros: [] as [string, unknown][],
}));

function consulta() {
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (estado.filtros.push([c, v]), q),
    order: () => q,
    range: async () => estado.resposta.shift() ?? { data: [], error: null },
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => consulta() }) }));
vi.mock("@/lib/banco/extrato", () => ({ registrarRecebimentoBanco: vi.fn() }));

const { listarParticipacoesCotacao } = await import("./pedidos");

describe("listarParticipacoesCotacao", () => {
  it("lê todas as páginas e filtra pelo SKU", async () => {
    estado.filtros = [];
    estado.resposta = [
      { data: [{ fornecedor: "JM", sku: "A" }], error: null },
      { data: [{ fornecedor: "Bahia", sku: "A" }], error: null },
      { data: [], error: null },
    ];
    await expect(listarParticipacoesCotacao("uni-1", "24/10/2026", "A")).resolves.toEqual([
      { fornecedor: "JM", sku: "A" },
      { fornecedor: "Bahia", sku: "A" },
    ]);
    expect(estado.filtros).toContainEqual(["sku", "A"]);
  });

  it("tabela ainda não criada: devolve vazio", async () => {
    estado.resposta = [{ data: null, error: { code: "PGRST205", message: "not in schema cache" } }];
    await expect(listarParticipacoesCotacao("uni-1", "24/10/2026")).resolves.toEqual([]);
  });

  it("outro erro sobe, nunca devolve lista parcial", async () => {
    estado.resposta = [
      { data: [{ fornecedor: "JM", sku: "A" }], error: null },
      { data: null, error: { code: "57014", message: "timeout" } },
    ];
    await expect(listarParticipacoesCotacao("uni-1", "24/10/2026")).rejects.toThrow("timeout");
  });
});
