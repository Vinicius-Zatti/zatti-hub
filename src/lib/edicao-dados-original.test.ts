import { beforeEach, describe, expect, it, vi } from "vitest";

// Parecer do Codex de 26/10/2026 (v2): original que a validação estrita
// recusava (ex.: unidade vazia no banco) virava "sem original" e a linha
// inteira era gravada, apagando o fornecedor ligado pela cotação. Do salvar
// da grade até a chamada ao banco, sem mock do caminho de gravação.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acesso", () => ({
  requireGestao: vi.fn(async () => ({
    unidadeId: "uni-1",
    spreadsheetId: null,
    fichasTecnicasHabilitado: false,
    permissoes: {},
  })),
  registrarAuditoria: vi.fn(async () => undefined),
  registrarAuditoriaBatch: vi.fn(async () => undefined),
  exigirEdicao: vi.fn(),
  temPermissao: () => true,
}));
vi.mock("@/lib/rate-limit", () => ({ exigirLimiteRequisicao: vi.fn(async () => undefined) }));
vi.mock("@/lib/estoque/fonte-dados", () => ({
  resolverFonteDadosEstoque: vi.fn(async () => ({ fonte: "banco", unidadeId: "uni-1", spreadsheetId: null })),
}));
vi.mock("@/lib/sheets/client", () => ({ getSheetsClient: vi.fn() }));
vi.mock("@/lib/skus/sugerir", () => ({ sugerirSku: vi.fn() }));
vi.mock("@/lib/sheets/inventario", () => ({ listInventario: vi.fn() }));
vi.mock("@/lib/banco/setores", () => ({ salvarDesignacoesBanco: vi.fn() }));
vi.mock("@/lib/contagem/pendencia", () => ({ setoresDaPendencia: vi.fn() }));
vi.mock("@/lib/banco/fichas-tecnicas", () => ({ sincronizarFichasRevenda: vi.fn(async () => undefined) }));
vi.mock("@/lib/banco/pre-preparo", () => ({
  lerVinculosPrePreparo: vi.fn(async () => new Map()),
  prePreparoVinculadoHabilitado: vi.fn(async () => false),
  sincronizarCustosPrePreparoMelhorEsforco: vi.fn(async () => undefined),
  sincronizarPrePreparos: vi.fn(async () => []),
}));
const banco = vi.hoisted(() => ({
  listarProdutosBanco: vi.fn(),
  salvarProdutosBanco: vi.fn(),
  excluirProdutoBanco: vi.fn(),
  inserirProdutoBanco: vi.fn(),
  vincularFornecedorProdutoBanco: vi.fn(),
  atualizarPrecoProdutoBanco: vi.fn(),
  atualizarFornecedor1ProdutoBanco: vi.fn(),
  salvarCamposProdutosBanco: vi.fn(async () => undefined),
}));
vi.mock("@/lib/banco/estoque", () => banco);

const { salvarProdutoAction, salvarProdutosAction } = await import("@/app/(app)/estoque/produtos/actions");

// Como está no banco quando a grade abre: unidade vazia (o banco aceita, a tela não).
const naGrade = {
  sku: "HORTOM001",
  posicao: null,
  grupo: "HOR",
  nome: "tomate",
  unidadeBase: "",
  precoUnitario: 10,
  estoqueNecessarioSemana: null,
  estoqueMinimo: null,
  nomeCompra: "tomate",
  unidadeEmbalagemFornecedor: "",
  qtdUnidadeBasePorEmbalagem: null,
  precoFornecedor: null,
  fornecedor1: "Ceasa",
  fornecedor2: "",
  fornecedor3: "",
  fornecedor4: "",
  observacoes: "",
  ativo: true,
  revenda: false,
};
// Depois disso a cotação liga a JM no fornecedor 2; a pessoa só preenche a unidade.
const editado = { ...naGrade, unidadeBase: "KG" };

beforeEach(() => vi.clearAllMocks());

describe("original incompleto do banco na Edição de Dados", () => {
  it("Salvar: grava só a unidade; o fornecedor 2 (JM) não é tocado", async () => {
    expect(await salvarProdutoAction(editado, naGrade)).toEqual({ ok: true });
    expect(banco.salvarCamposProdutosBanco).toHaveBeenCalledWith(
      [{ sku: "HORTOM001", campos: { unidade_base: "KG" } }],
      "uni-1"
    );
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("Salvar todos: mesmo cenário em lote", async () => {
    const outro = { ...naGrade, sku: "HORCEB001", nome: "cebola", unidadeBase: "KG", precoUnitario: -1 };
    const r = await salvarProdutosAction([editado, { ...outro, precoUnitario: 5 }], [naGrade, outro]);
    expect(r).toEqual({ ok: true });
    expect(banco.salvarCamposProdutosBanco).toHaveBeenCalledWith(
      [
        { sku: "HORTOM001", campos: { unidade_base: "KG" } },
        { sku: "HORCEB001", campos: { preco_unitario: 5 } },
      ],
      "uni-1"
    );
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("original fora do formato ou de outro SKU: erro e nada gravado", async () => {
    const r1 = await salvarProdutoAction(editado, { ...naGrade, ativo: "sim" } as never);
    const r2 = await salvarProdutoAction(editado, { ...naGrade, sku: "HORCEB001" });
    const r3 = await salvarProdutosAction([editado], [{ ...naGrade, campoNovo: 1 }] as never);
    for (const r of [r1, r2, r3]) expect(r).toHaveProperty("erro", expect.stringMatching(/Recarregue a página/));
    expect(banco.salvarCamposProdutosBanco).not.toHaveBeenCalled();
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("sem original (tela antiga em cache): pede recarregar, nunca grava a linha inteira", async () => {
    const r = await salvarProdutoAction(editado);
    expect(r).toHaveProperty("erro", expect.stringMatching(/Recarregue a página/));
    const r2 = await salvarProdutosAction([editado]);
    expect(r2).toHaveProperty("erro", expect.stringMatching(/Recarregue a página/));
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });
});
