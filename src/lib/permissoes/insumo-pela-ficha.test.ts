import { beforeEach, describe, expect, it, vi } from "vitest";
import { niveisEfetivos } from "./modulos";

// Insumo novo pela ficha técnica (decisão de Vinícius, 29/10/2026): quem edita ficha (Cardápio
// "chef" ou mais) cria produto pelo "+ Novo insumo", mesmo sem "editar" em Cadastros. Só criar,
// com os campos do cadastro rápido.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let acessoAtual: Record<string, unknown> = {};
const registrarAuditoria = vi.fn(async () => undefined);
vi.mock("@/lib/acesso", async () => {
  const { rank } = await import("./modulos");
  return {
    getAcessoAtual: vi.fn(async () => acessoAtual),
    requireGestao: vi.fn(async () => acessoAtual),
    registrarAuditoria: (...a: unknown[]) => registrarAuditoria(...(a as [])),
    registrarAuditoriaBatch: vi.fn(async () => undefined),
    exigirEdicao: vi.fn(),
    temPermissao: (a: { permissoes: Record<string, string> }, chave: string, nivel: string) =>
      rank(a.permissoes[chave] as never) >= rank(nivel as never),
  };
});
const inserirProduto = vi.fn(async () => undefined);
vi.mock("@/lib/sheets/produtos", () => ({
  excluirProduto: vi.fn(),
  inserirProduto: (...a: unknown[]) => inserirProduto(...(a as [])),
  listProdutos: vi.fn(),
  definirFornecedor1NoProduto: vi.fn(),
  salvarProdutosEditados: vi.fn(),
}));
const sugerirSku = vi.fn(async () => ({ sku: "MERPBA001", grupo: "MER", motivo: "pão" }));
vi.mock("@/lib/skus/sugerir", () => ({ sugerirSku: (...a: unknown[]) => sugerirSku(...(a as [])) }));
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
vi.mock("@/lib/rate-limit", () => ({ exigirLimiteRequisicao: vi.fn(async () => undefined) }));

const { criarProdutoPelaFichaAction, sugerirSkuPelaFichaAction } = await import(
  "@/app/(app)/estoque/produtos/actions"
);

function formulario(extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  const campos: Record<string, string> = {
    sku: "merpba001",
    grupo: "MER",
    nome: "pão brioche",
    unidadeBase: "UN",
    precoUnitario: "1.5",
    nomeCompra: "pão brioche",
    observacoes: "",
    // Campos fora do cadastro rápido: a action ignora, nunca grava.
    fornecedor1: "FTC001",
    revenda: "true",
    ativo: "false",
    unidadeEmbalagemFornecedor: "PCT",
    ...extra,
  };
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

function acesso(role: "master" | "gestao" | "operacional", excecoes: Record<string, string>, extra: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    unidadeId: "zatti-burger",
    spreadsheetId: null,
    areaInterna: false,
    fichasTecnicasHabilitado: true,
    role,
    permissoes: niveisEfetivos(role, false, excecoes as never),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("criarProdutoPelaFichaAction", () => {
  it("chef da operação cria o insumo só com os campos do cadastro rápido", async () => {
    acessoAtual = acesso("operacional", { cardapio: "chef" });
    const r = await criarProdutoPelaFichaAction(formulario());
    expect(r.ok).toBe(true);
    expect(inserirProduto).toHaveBeenCalledTimes(1);
    const [produto] = inserirProduto.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(produto).toMatchObject({
      sku: "MERPBA001",
      nome: "pão brioche",
      precoUnitario: 1.5,
      ativo: true,
      revenda: false,
      fornecedor1: "",
      unidadeEmbalagemFornecedor: "",
      qtdUnidadeBasePorEmbalagem: null,
      precoFornecedor: null,
    });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "criar_pela_ficha" }));
  });

  it("gerente chef que só vê Cadastros cria pela ficha", async () => {
    acessoAtual = acesso("gestao", { cardapio: "chef", cadastros: "ver" });
    expect((await criarProdutoPelaFichaAction(formulario())).ok).toBe(true);
  });

  it("gestão e master (Cardápio editar) criam pela ficha", async () => {
    acessoAtual = acesso("gestao", {});
    expect((await criarProdutoPelaFichaAction(formulario())).ok).toBe(true);
    acessoAtual = acesso("master", {});
    expect((await criarProdutoPelaFichaAction(formulario())).ok).toBe(true);
    expect(inserirProduto).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["operação sem chef", acesso("operacional", {})],
    ["gestão que só vê o Cardápio", acesso("gestao", { cardapio: "ver" })],
    ["unidade sem Fichas Técnicas", acesso("operacional", { cardapio: "chef" }, { fichasTecnicasHabilitado: false })],
    ["área interna (sem Navegação V2)", acesso("gestao", {}, { areaInterna: true })],
  ])("%s não cria e nada é gravado", async (_nome, a) => {
    acessoAtual = a;
    const r = await criarProdutoPelaFichaAction(formulario());
    expect(r).toEqual({
      ok: false,
      mensagem: "Cadastrar insumo pela ficha técnica é de quem edita a ficha. Peça a quem administra a equipe.",
    });
    expect(inserirProduto).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

const GRUPO_FORA =
  "Pela ficha técnica só se cadastra insumo de grupo que entra em ficha. Limpeza e Operacional ficam em Cadastros.";

describe("criarProdutoPelaFichaAction sem editar em Cadastros (30/10/2026)", () => {
  const comEstoque = { estoqueMinimo: "10", estoqueNecessarioSemana: "20" };

  it.each([
    ["chef da operação", acesso("operacional", { cardapio: "chef" })],
    ["gerente chef que só vê Cadastros", acesso("gestao", { cardapio: "chef", cadastros: "ver" })],
    ["gestão sem acesso a Cadastros que edita o Cardápio", acesso("gestao", { cadastros: "sem_acesso" })],
  ])("%s: estoque mínimo e da semana nascem vazios", async (_nome, a) => {
    acessoAtual = a;
    expect((await criarProdutoPelaFichaAction(formulario(comEstoque))).ok).toBe(true);
    const [produto] = inserirProduto.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(produto).toMatchObject({ estoqueMinimo: null, estoqueNecessarioSemana: null });
  });

  it.each(["LIM", "OPE", "ope"])("chef não cria insumo do grupo %s e nada é gravado", async (grupo) => {
    acessoAtual = acesso("operacional", { cardapio: "chef" });
    const r = await criarProdutoPelaFichaAction(formulario({ grupo, sku: "limdet001" }));
    expect(r).toEqual({ ok: false, mensagem: GRUPO_FORA });
    expect(inserirProduto).not.toHaveBeenCalled();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ["gestão com Cadastros", acesso("gestao", {})],
    ["master", acesso("master", {})],
  ])("%s pela ficha segue com todos os campos e qualquer grupo", async (_nome, a) => {
    acessoAtual = a;
    expect((await criarProdutoPelaFichaAction(formulario({ ...comEstoque, grupo: "LIM", sku: "limdet001" }))).ok).toBe(true);
    const [produto] = inserirProduto.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(produto).toMatchObject({ grupo: "LIM", estoqueMinimo: 10, estoqueNecessarioSemana: 20 });
  });
});

describe("sugerirSkuPelaFichaAction", () => {
  it("chef recebe aviso quando a sugestão cai em grupo fora da ficha", async () => {
    acessoAtual = acesso("operacional", { cardapio: "chef" });
    sugerirSku.mockResolvedValueOnce({ sku: "LIMDET001", grupo: "LIM", motivo: "limpeza" });
    expect(await sugerirSkuPelaFichaAction("detergente")).toEqual({ erro: GRUPO_FORA });
  });

  it("gestão com Cadastros recebe a sugestão de Limpeza normalmente", async () => {
    acessoAtual = acesso("gestao", {});
    sugerirSku.mockResolvedValueOnce({ sku: "LIMDET001", grupo: "LIM", motivo: "limpeza" });
    expect(await sugerirSkuPelaFichaAction("detergente")).toEqual({ sku: "LIMDET001", grupo: "LIM", motivo: "limpeza" });
  });

  it("chef recebe a sugestão", async () => {
    acessoAtual = acesso("operacional", { cardapio: "chef" });
    expect(await sugerirSkuPelaFichaAction("pão brioche")).toEqual({ sku: "MERPBA001", grupo: "MER", motivo: "pão" });
  });

  it("operação sem chef não usa a sugestão", async () => {
    acessoAtual = acesso("operacional", {});
    const r = await sugerirSkuPelaFichaAction("pão brioche");
    expect("erro" in r).toBe(true);
    expect(sugerirSku).not.toHaveBeenCalled();
  });
});
