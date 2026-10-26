import { beforeEach, describe, expect, it, vi } from "vitest";

// Parecer do Codex (24/10/2026, ponto 1): no banco, o vínculo do fornecedor
// pela cotação é sempre a função atômica. Sem ela, falha (quem chama mostra o
// aviso), mas nunca lê e regrava a linha inteira, que perdia o vínculo de uma
// confirmação simultânea.

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ getSheetsClient: vi.fn() }));
vi.mock("@/lib/estoque/fonte-dados", () => ({
  resolverFonteDadosEstoque: vi.fn(async () => ({ fonte: "banco", unidadeId: "uni-1", spreadsheetId: null })),
}));

const banco = vi.hoisted(() => ({
  listarProdutosBanco: vi.fn(),
  salvarProdutosBanco: vi.fn(),
  excluirProdutoBanco: vi.fn(),
  inserirProdutoBanco: vi.fn(),
  vincularFornecedorProdutoBanco: vi.fn(),
  atualizarPrecoProdutoBanco: vi.fn(),
  atualizarFornecedor1ProdutoBanco: vi.fn(),
  salvarCamposProdutosBanco: vi.fn(),
}));
vi.mock("@/lib/banco/estoque", () => banco);

const { vincularFornecedorNoProduto, definirFornecedor1NoProduto, salvarProdutosEditados } = await import("./produtos");

const produto = {
  sku: "HORTOM001",
  posicao: null,
  grupo: "HOR",
  nome: "tomate",
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
};

beforeEach(() => {
  for (const fn of Object.values(banco)) fn.mockReset();
});

describe("vínculo do fornecedor no Cadastro (fonte banco)", () => {
  it("função ausente ou com erro: falha sem ler nem regravar a linha", async () => {
    banco.vincularFornecedorProdutoBanco.mockRejectedValue(new Error("PGRST202"));
    await expect(vincularFornecedorNoProduto("HORTOM001", "JM", null)).rejects.toThrow();
    expect(banco.listarProdutosBanco).not.toHaveBeenCalled();
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("duas confirmações ao mesmo tempo vão as duas pela função atômica", async () => {
    // A função trava a linha: a segunda espera a primeira e pega a vaga seguinte.
    const vagas = ["fornecedor_1", "fornecedor_2"];
    banco.vincularFornecedorProdutoBanco.mockImplementation(
      () => new Promise((ok) => setTimeout(() => ok(vagas.shift()), 5))
    );
    const resultados = await Promise.all([
      vincularFornecedorNoProduto("HORTOM001", "JM", null),
      vincularFornecedorNoProduto("HORTOM001", "Bahia", null),
    ]);
    expect(resultados).toEqual(["vinculado", "vinculado"]);
    expect(banco.vincularFornecedorProdutoBanco).toHaveBeenCalledTimes(2);
    expect(banco.listarProdutosBanco).not.toHaveBeenCalled();
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("repassa já vinculado, sem vaga e sem produto", async () => {
    for (const r of ["ja_vinculado", "sem_vaga", "sem_produto"] as const) {
      banco.vincularFornecedorProdutoBanco.mockResolvedValueOnce(r);
      await expect(vincularFornecedorNoProduto("HORTOM001", "JM", null)).resolves.toBe(r);
    }
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("definir o Fornecedor 1 grava só essa coluna", async () => {
    await definirFornecedor1NoProduto(produto, "Ceasa", null);
    expect(banco.atualizarFornecedor1ProdutoBanco).toHaveBeenCalledWith("uni-1", "HORTOM001", "Ceasa");
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });
});

describe("Edição de Dados grava só o que mudou (parecer do Codex de 26/10/2026)", () => {
  it("cenário do Codex: grade carregada, a cotação liga a JM, a grade salva outro campo e o vínculo fica", async () => {
    // A grade carregou o tomate com a vaga 2 vazia; a RPC gravou JM depois.
    const naGrade = { ...produto, fornecedor1: "Ceasa" };
    const editado = { ...naGrade, nome: "tomate italiano", nomeCompra: "tomate italiano" };
    await salvarProdutosEditados([{ produto: editado, original: naGrade }], null);
    expect(banco.salvarCamposProdutosBanco).toHaveBeenCalledWith(
      [{ sku: "HORTOM001", campos: { nome: "tomate italiano", nome_compra: "tomate italiano" } }],
      "uni-1"
    );
    // Nada de linha inteira (que mandaria fornecedor_2 vazio de volta).
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("Salvar todos: uma chamada só, linhas sem mudança ficam de fora", async () => {
    await salvarProdutosEditados(
      [
        { produto: { ...produto, precoUnitario: 12 }, original: produto },
        { produto: { ...produto, sku: "HORCEB001" }, original: { ...produto, sku: "HORCEB001" } },
      ],
      null
    );
    expect(banco.salvarCamposProdutosBanco).toHaveBeenCalledTimes(1);
    expect(banco.salvarCamposProdutosBanco).toHaveBeenCalledWith(
      [{ sku: "HORTOM001", campos: { preco_unitario: 12 } }],
      "uni-1"
    );
  });

  it("sem original ou com SKU diferente: recusa, nunca grava a linha inteira (parecer v2)", async () => {
    await expect(salvarProdutosEditados([{ produto }], null)).rejects.toThrow(/Recarregue a página/);
    await expect(
      salvarProdutosEditados([{ produto, original: { ...produto, sku: "HORCEB001" } }], null)
    ).rejects.toThrow(/Recarregue a página/);
    // Lote com uma linha ruim não grava nenhuma.
    await expect(
      salvarProdutosEditados([{ produto: { ...produto, nome: "x" }, original: produto }, { produto }], null)
    ).rejects.toThrow();
    expect(banco.salvarCamposProdutosBanco).not.toHaveBeenCalled();
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });

  it("função ausente no banco: falha, sem cair na linha inteira", async () => {
    banco.salvarCamposProdutosBanco.mockRejectedValue(new Error("PGRST202"));
    await expect(
      salvarProdutosEditados([{ produto: { ...produto, nome: "x" }, original: produto }], null)
    ).rejects.toThrow();
    expect(banco.salvarProdutosBanco).not.toHaveBeenCalled();
  });
});
