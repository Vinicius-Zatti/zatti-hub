import { beforeEach, describe, expect, it, vi } from "vitest";
import { niveisEfetivos } from "./modulos";

// Cadastros x Cardápio (25/10/2026): marcar ou desmarcar pré-preparo mexe em ficha técnica. Quem
// não edita o Cardápio recebe uma mensagem única e NADA é salvo (nem o produto).

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let acessoAtual: Record<string, unknown> = {};
vi.mock("@/lib/acesso", async () => {
  const { rank } = await import("./modulos");
  return {
    requireGestao: vi.fn(async () => acessoAtual),
    registrarAuditoria: vi.fn(async () => undefined),
    registrarAuditoriaBatch: vi.fn(async () => undefined),
    temPermissao: (a: { permissoes: Record<string, string> }, chave: string, nivel: string) =>
      rank(a.permissoes[chave] as never) >= rank(nivel as never),
  };
});
const upsertProduto = vi.fn(async () => undefined);
const upsertProdutosBatch = vi.fn(async () => undefined);
vi.mock("@/lib/sheets/produtos", () => ({
  excluirProduto: vi.fn(),
  inserirProduto: vi.fn(),
  listProdutos: vi.fn(),
  upsertProduto: (...a: unknown[]) => upsertProduto(...(a as [])),
  upsertProdutosBatch: (...a: unknown[]) => upsertProdutosBatch(...(a as [])),
}));
vi.mock("@/lib/skus/sugerir", () => ({ sugerirSku: vi.fn() }));
vi.mock("@/lib/sheets/inventario", () => ({ listInventario: vi.fn() }));
vi.mock("@/lib/banco/setores", () => ({ salvarDesignacoesBanco: vi.fn() }));
vi.mock("@/lib/contagem/pendencia", () => ({ setoresDaPendencia: vi.fn() }));
vi.mock("@/lib/banco/fichas-tecnicas", () => ({ sincronizarFichasRevenda: vi.fn(async () => undefined) }));
const sincronizarPrePreparos = vi.fn(async () => [] as string[]);
let marcadosHoje = new Map<string, { prePreparo: boolean; fichaId: string | null; fichaStatus: null }>();
vi.mock("@/lib/banco/pre-preparo", () => ({
  lerVinculosPrePreparo: vi.fn(async () => marcadosHoje),
  prePreparoVinculadoHabilitado: vi.fn(async () => true),
  sincronizarCustosPrePreparoMelhorEsforco: vi.fn(async () => undefined),
  sincronizarPrePreparos: (...a: unknown[]) => sincronizarPrePreparos(...(a as [])),
}));
vi.mock("@/lib/rate-limit", () => ({ exigirLimiteRequisicao: vi.fn(async () => undefined) }));

const { salvarProdutoAction, salvarProdutosAction } = await import("@/app/(app)/estoque/produtos/actions");

const produto = {
  sku: "PRE000001",
  posicao: null,
  grupo: "PRE",
  nome: "molho da casa",
  unidadeBase: "KG",
  precoUnitario: 10,
  estoqueNecessarioSemana: null,
  estoqueMinimo: null,
  nomeCompra: "",
  unidadeEmbalagemFornecedor: "",
  qtdUnidadeBasePorEmbalagem: null,
  precoFornecedor: null,
  fornecedor1: "",
  fornecedor2: "",
  fornecedor3: "",
  fornecedor4: "",
  observacoes: "",
  ativo: true,
  revenda: false,
  prePreparo: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  marcadosHoje = new Map();
  acessoAtual = {
    unidadeId: "zatti-burger",
    spreadsheetId: null,
    fichasTecnicasHabilitado: true,
    permissoes: niveisEfetivos("gestao", false, { cardapio: "ver" }),
  };
});

describe("pré-preparo sem Editar no Cardápio", () => {
  it("marcar pré-preparo: mensagem única e nada salvo", async () => {
    const r = await salvarProdutoAction(produto as never);
    expect(r).toHaveProperty("erro");
    expect((r as { erro: string }).erro).toMatch(/Nada foi salvo/);
    expect(upsertProduto).not.toHaveBeenCalled();
    expect(sincronizarPrePreparos).not.toHaveBeenCalled();
  });

  it("grade em lote também não salva pela metade", async () => {
    const r = await salvarProdutosAction([{ ...produto, prePreparo: false, sku: "PRE000002" }, produto] as never);
    expect(r).toHaveProperty("erro");
    expect(upsertProdutosBatch).not.toHaveBeenCalled();
  });

  it("sem mudar a chave de pré-preparo, o produto salva normalmente", async () => {
    marcadosHoje = new Map([["PRE000001", { prePreparo: true, fichaId: "f1", fichaStatus: null }]]);
    const r = await salvarProdutoAction(produto as never);
    expect(r).toEqual({ ok: true });
    expect(upsertProduto).toHaveBeenCalledTimes(1);
  });

  it("com Editar no Cardápio segue como hoje", async () => {
    acessoAtual = { ...acessoAtual, permissoes: niveisEfetivos("gestao", false, {}) };
    expect(await salvarProdutoAction(produto as never)).toEqual({ ok: true });
    expect(sincronizarPrePreparos).toHaveBeenCalledTimes(1);
  });
});
