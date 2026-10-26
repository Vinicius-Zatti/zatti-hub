import { beforeEach, describe, expect, it, vi } from "vitest";

// Parecer do Codex (24/10/2026):
// - ponto 1: vínculo que falha preserva o item salvo e devolve o aviso;
// - ponto 3: o desfazer vencedor recria o concorrente avulso que participou da
//   cotação, mesmo que a tela (recarregada) não o mande mais.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acesso", () => ({
  requireGestao: vi.fn(async () => ({ unidadeId: "uni-1", spreadsheetId: null, userId: "u-1" })),
  registrarAuditoria: vi.fn(async () => undefined),
  exigirEdicao: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ exigirLimiteRequisicao: vi.fn(async () => undefined) }));
vi.mock("@/lib/banco/pre-preparo", () => ({ sincronizarCustosPrePreparoMelhorEsforco: vi.fn() }));

const pedidos = vi.hoisted(() => ({
  confirmarItem: vi.fn(async () => undefined),
  confirmarVencedor: vi.fn(async () => undefined),
  desfazerVencedor: vi.fn(async () => undefined),
  atualizarPrevisaoEntrega: vi.fn(async () => undefined),
  listarParticipacoesCotacao: vi.fn(async () => [] as { fornecedor: string; sku: string }[]),
}));
vi.mock("@/lib/pedidos", () => pedidos);

const produtos = vi.hoisted(() => ({
  listProdutos: vi.fn(async () => []),
  atualizarPrecoProduto: vi.fn(),
  vincularFornecedorNoProduto: vi.fn(),
}));
vi.mock("@/lib/sheets/produtos", () => produtos);
vi.mock("@/lib/sheets/fornecedores", () => ({
  listFornecedores: vi.fn(async () => [
    { nomeFantasia: "JM", razaoSocial: "JM Ltda" },
    { nomeFantasia: "Bahia Carnes", razaoSocial: "" },
    { nomeFantasia: "Ceasa", razaoSocial: "" },
  ]),
}));

const { confirmarItemAction, desfazerVencedorAction } = await import("@/app/(app)/estoque/pedidos/cotacoes/actions");

const item = {
  sku: "PROCDB001",
  nome: "costela de boi",
  nomeCompra: "",
  unidadeBase: "KG",
  quantidadePedida: 12,
  precoAntigo: 23.5,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmar item com vínculo", () => {
  it("vínculo que falha (ex.: função ausente) mantém o item salvo e avisa", async () => {
    produtos.vincularFornecedorNoProduto.mockRejectedValue(new Error("PGRST202"));
    const r = await confirmarItemAction({
      fornecedor: "Bahia Carnes",
      dataContagemBase: "24/10/2026",
      item: { ...item, precoAtualizado: 23.5, precoConfirmado: true },
      atualizarPreco: true,
      vincularFornecedor: true,
    });
    expect(pedidos.confirmarItem).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      ok: true,
      aviso: "Item salvo no pedido, mas não foi possível ligar o fornecedor ao produto no Cadastro.",
    });
  });
});

describe("desfazer vencedor com participação persistida", () => {
  it("recria o avulso que a tela não mandou (recarregou, 4 vagas cheias)", async () => {
    pedidos.listarParticipacoesCotacao.mockResolvedValueOnce([
      { fornecedor: "JM", sku: "PROCDB001" },
      { fornecedor: "Ceasa", sku: "PROCDB001" },
      { fornecedor: " bahia carnes ", sku: "PROCDB001" },
    ]);
    const r = await desfazerVencedorAction({
      dataContagemBase: "24/10/2026",
      fornecedorAtual: "JM",
      outrosFornecedores: ["Ceasa"],
      item,
    });
    expect(pedidos.listarParticipacoesCotacao).toHaveBeenCalledWith("uni-1", "24/10/2026", "PROCDB001");
    expect(r).toEqual({ ok: true, concorrentes: ["Ceasa", "Bahia Carnes"] });
    expect(pedidos.desfazerVencedor).toHaveBeenCalledWith(
      expect.objectContaining({ fornecedorAtual: "JM", outrosFornecedores: ["Ceasa", "Bahia Carnes"] })
    );
  });

  it("sem participação gravada fica como a tela mandou", async () => {
    const r = await desfazerVencedorAction({
      dataContagemBase: "24/10/2026",
      fornecedorAtual: "JM",
      outrosFornecedores: ["Ceasa"],
      item,
    });
    expect(r).toEqual({ ok: true, concorrentes: ["Ceasa"] });
  });
});
