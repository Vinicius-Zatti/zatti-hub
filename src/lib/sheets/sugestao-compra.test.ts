import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemInventario, Produto } from "@/lib/types";
import type { AndamentoSetor, EscopoSetor } from "@/lib/contagem/setor";

const listProdutosMock = vi.fn();
const listInventarioMock = vi.fn();
const calcularAlertaMock = vi.fn<(...args: unknown[]) => string>(() => "");

vi.mock("./produtos", () => ({ listProdutos: () => listProdutosMock() }));
vi.mock("./inventario", () => ({
  listInventario: () => listInventarioMock(),
  calcularAlerta: (...args: unknown[]) => calcularAlertaMock(...args),
}));

const { gerarPedido, alertaDaCotacao } = await import("./sugestao-compra");
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
  it("item sem ponto de reposicao aparece, sem sugestao e com etiqueta", async () => {
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 5), produto("HORTOM001", null)]);
    listInventarioMock.mockResolvedValue([item("HORLTA001", 2), item("HORTOM001", 1)]);

    const { itens } = await gerarPedido({ data: DATA }, null);
    const tomate = itens.find((i) => i.sku === "HORTOM001");

    expect(itens).toHaveLength(2);
    expect(tomate).toMatchObject({
      estoqueAtual: 1,
      estoqueNecessario: null,
      quantidadeSugerida: 0,
      precisaComprar: false,
      alerta: "Sem ponto de reposição",
    });
    expect(itens.find((i) => i.sku === "HORLTA001")).toMatchObject({ quantidadeSugerida: 3, alerta: "" });
  });

  it("comprar emergencial vence a etiqueta de sem ponto de reposicao", async () => {
    listProdutosMock.mockResolvedValue([produto("HORTOM001", null)]);
    listInventarioMock.mockResolvedValue([item("HORTOM001", 1)]);
    calcularAlertaMock.mockReturnValueOnce("Comprar emergencial");

    const { itens } = await gerarPedido({ data: DATA }, null);

    expect(itens[0]).toMatchObject({ quantidadeSugerida: 0, alerta: "Comprar emergencial" });
  });

  it("sem ponto, sem preco e abaixo do minimo mostra emergencial e falta de preco", () => {
    const p = { estoqueNecessarioSemana: null, estoqueMinimo: 3, precoUnitario: null };
    // calcularAlerta real devolve "Falta preço no cadastro" antes de olhar o mínimo.
    expect(alertaDaCotacao(p, 1, "Falta preço no cadastro")).toBe(
      "Comprar emergencial · Falta preço no cadastro"
    );
    expect(alertaDaCotacao({ ...p, estoqueMinimo: null }, 1, "Falta preço no cadastro")).toBe(
      "Sem ponto de reposição · Falta preço no cadastro"
    );
    expect(alertaDaCotacao({ ...p, precoUnitario: 10 }, 5, "")).toBe("Sem ponto de reposição");
    expect(alertaDaCotacao({ ...p, estoqueNecessarioSemana: 8 }, 1, "Falta preço no cadastro")).toBe(
      "Falta preço no cadastro"
    );
  });

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

describe("varias contagens base (13/10/2026)", () => {
  const D11 = "11/10/2026";
  const D12 = "12/10/2026";
  function itemEm(data: string, sku: string, quantidade: number, setor: { id: string; nome: string }) {
    return { ...item(sku, quantidade, setor), data, id: `${sku}-${setor.id}-${data}` };
  }

  it("junta os setores que contaram em dias diferentes, sem somar o mesmo setor duas vezes", async () => {
    // The House: bar fechou em 11/10 (cozinha pendente), cozinha fechou em
    // 12/10 (bar pendente). Limão vive nos dois setores; arroz só na cozinha.
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 30), produto("MERARR001", 5, "MER")]);
    listInventarioMock.mockResolvedValue([
      itemEm(D11, "HORLTA001", 18, BAR),
      itemEm(D11, "HORLTA001", 4, COZINHA), // cozinha contou de novo em 12/10: vale só a última
      itemEm(D12, "HORLTA001", 5, COZINHA),
      itemEm(D12, "MERARR001", 2, COZINHA),
    ]);

    const resultado = await gerarPedido(
      {
        datas: [D11, D12],
        escopo: [...escopoLimao, { sku: "MERARR001", setorId: COZINHA.id, setorNome: COZINHA.nome }],
        // Já consolidado pela página (`carregarEscopoEAndamentoBanco`).
        andamento: andamento(true, true),
      },
      null,
    );

    expect(resultado.dataUsada).toBe(D12);
    expect(resultado.datasUsadas).toEqual([D12, D11]);
    expect(resultado.setoresPendentes).toEqual([]);

    const limao = resultado.itens.find((i) => i.sku === "HORLTA001")!;
    expect(limao.estoqueAtual).toBe(23);
    expect(limao.quantidadeSugerida).toBe(7);
    expect(limao.setoresQueNaoContaram).toEqual([]);
    expect(limao.datasContagem).toEqual([D12, D11]);

    const arroz = resultado.itens.find((i) => i.sku === "MERARR001")!;
    expect(arroz.estoqueAtual).toBe(2);
    expect(arroz.datasContagem).toEqual([D12]);
  });

  it("uma data so continua igual: so as linhas dela", async () => {
    listProdutosMock.mockResolvedValue([produto("HORLTA001", 30)]);
    listInventarioMock.mockResolvedValue([itemEm(D11, "HORLTA001", 18, BAR), itemEm(D12, "HORLTA001", 5, COZINHA)]);

    const resultado = await gerarPedido({ datas: [D12], escopo: escopoLimao, andamento: andamento(false, true) }, null);

    expect(resultado.datasUsadas).toEqual([D12]);
    const limao = resultado.itens.find((i) => i.sku === "HORLTA001")!;
    expect(limao.estoqueAtual).toBe(5);
    expect(limao.setoresQueNaoContaram).toEqual(["Bar"]);
    expect(resultado.setoresPendentes).toEqual(["Bar"]);
  });
});
