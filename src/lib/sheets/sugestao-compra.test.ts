import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemInventario, Produto } from "@/lib/types";
import type { AndamentoSetor, EscopoSetor } from "@/lib/contagem/setor";

const listProdutosMock = vi.fn();
const listInventarioMock = vi.fn();

vi.mock("./produtos", () => ({ listProdutos: () => listProdutosMock() }));
vi.mock("./inventario", () => ({
  listInventario: () => listInventarioMock(),
  calcularAlerta: () => "",
}));

const { gerarPedido } = await import("./sugestao-compra");
const { valorContagem } = await import("@/lib/cmv");

const DATA = "17/09/2026";
const BAR = { id: "s-bar", nome: "Bar" };
const COZINHA = { id: "s-coz", nome: "Cozinha" };

function produto(sku: string, necessario: number | null, grupo = "HOR"): Produto {
  return {
    sku,
    posicao: null,
    grupo,
    nome: sku.toLowerCase(),
    unidadeBase: "KG",
    precoUnitario: 10,
    estoqueNecessarioSemana: necessario,
    estoqueMinimo: null,
    nomeCompra: sku.toLowerCase(),
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
}

function item(
  sku: string,
  quantidade: number,
  setor?: { id: string; nome: string },
  grupo = "HOR",
): ItemInventario {
  return {
    data: DATA,
    mes: "setembro 2026",
    sku,
    grupo,
    nome: sku.toLowerCase(),
    unidadeBase: "KG",
    quantidade,
    precoUnitario: 10,
    total: quantidade * 10,
    alerta: "",
    id: `${sku}-${setor?.id ?? "legado"}`,
    setorId: setor?.id ?? null,
    setorNome: setor?.nome ?? null,
  };
}

const escopoLimao: EscopoSetor[] = [
  { sku: "HORLTA001", setorId: BAR.id, setorNome: BAR.nome },
  { sku: "HORLTA001", setorId: COZINHA.id, setorNome: COZINHA.nome },
];

function andamento(barConcluido: boolean, cozinhaConcluida: boolean): AndamentoSetor[] {
  return [
    {
      setorId: BAR.id,
      setorNome: BAR.nome,
      situacao: barConcluido ? "concluido" : "pendente",
      enviadoEm: null,
      enviadoPor: null,
    },
    {
      setorId: COZINHA.id,
      setorNome: COZINHA.nome,
      situacao: cozinhaConcluida ? "concluido" : "pendente",
      enviadoEm: null,
      enviadoPor: null,
    },
  ];
}

beforeEach(() => {
  listProdutosMock.mockReset();
  listInventarioMock.mockReset();
});

describe("estoque atual com setor", () => {
  it("soma os setores em vez de ficar com a ultima linha gravada", async () => {
    const itens = [item("HORLTA001", 2, BAR), item("HORLTA001", 4, COZINHA)];
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 8)]);
    listInventarioMock.mockResolvedValue(itens);

    const resultado = await gerarPedido(
      { data: DATA, escopo: escopoLimao, andamento: andamento(true, true) },
      null,
    );

    const limao = resultado.itens.find((i) => i.sku === "HORLTA001")!;
    expect(limao.estoqueAtual).toBe(6);
    expect(limao.quantidadeSugerida).toBe(2);
    expect(limao.setoresQueNaoContaram).toEqual([]);
  });

  it("cotacao e CMV chegam no mesmo numero", async () => {
    const itens = [item("HORLTA001", 2, BAR), item("HORLTA001", 4, COZINHA)];
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 8)]);
    listInventarioMock.mockResolvedValue(itens);

    const resultado = await gerarPedido(
      { data: DATA, escopo: escopoLimao, andamento: andamento(true, true) },
      null,
    );
    const limao = resultado.itens.find((i) => i.sku === "HORLTA001")!;

    // CMV soma valor (6 kg x R$10); a cotação soma quantidade. Os dois têm
    // que enxergar a mesma contagem - era exatamente aqui que divergiam.
    expect(valorContagem(itens, DATA)).toBe(60);
    expect(limao.estoqueAtual! * limao.precoUnitario!).toBe(60);
  });
});

describe("contagem parcial", () => {
  it("marca o item com o setor que nao contou", async () => {
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 8)]);
    listInventarioMock.mockResolvedValue([item("HORLTA001", 2, BAR)]);

    const resultado = await gerarPedido(
      { data: DATA, escopo: escopoLimao, andamento: andamento(true, false) },
      null,
    );

    const limao = resultado.itens.find((i) => i.sku === "HORLTA001")!;
    expect(limao.estoqueAtual).toBe(2);
    expect(limao.setoresQueNaoContaram).toEqual(["Cozinha"]);
    expect(resultado.setoresPendentes).toEqual(["Cozinha"]);
  });

  it("escopo vira os produtos dos setores ja concluidos", async () => {
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 8), produto("MERARR001", 5, "MER")]);
    listInventarioMock.mockResolvedValue([item("HORLTA001", 2, BAR)]);

    const resultado = await gerarPedido(
      {
        data: DATA,
        escopo: [
          ...escopoLimao,
          { sku: "MERARR001", setorId: COZINHA.id, setorNome: COZINHA.nome },
        ],
        andamento: andamento(true, false),
      },
      null,
    );

    // Arroz é só da cozinha, que não fechou: não entra na cotação ainda.
    expect(resultado.itens.map((i) => i.sku)).toEqual(["HORLTA001"]);
  });
});

describe("compatibilidade com contagem legada", () => {
  it("sem escopo, mantem a regra antiga de escopo por grupo contado", async () => {
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 8), produto("MERARR001", 5, "MER")]);
    listInventarioMock.mockResolvedValue([item("HORLTA001", 3)]);

    const resultado = await gerarPedido({ data: DATA }, null);

    expect(resultado.itens.map((i) => i.sku)).toEqual(["HORLTA001"]);
    expect(resultado.itens[0].estoqueAtual).toBe(3);
    expect(resultado.setoresPendentes).toEqual([]);
  });

  it("soma tambem quando as linhas legadas repetem o mesmo SKU", async () => {
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 8)]);
    listInventarioMock.mockResolvedValue([item("HORLTA001", 2), item("HORLTA001", 4)]);

    const resultado = await gerarPedido({ data: DATA }, null);
    expect(resultado.itens[0].estoqueAtual).toBe(6);
  });
});
