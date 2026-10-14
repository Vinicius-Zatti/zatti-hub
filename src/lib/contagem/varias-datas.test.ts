import { describe, expect, it } from "vitest";
import type { ItemInventario } from "@/lib/types";
import type { AndamentoSetor, EscopoSetor } from "@/lib/contagem/setor";
import {
  andamentoDeVariasDatas,
  consolidarVariasDatas,
  escolherDatasContagem,
  escopoDeVariasDatas,
  listaDoParametro,
} from "./varias-datas";
import { quantidadePorSku } from "./setor";

const D11 = "11/10/2026";
const D12 = "12/10/2026";
const D05 = "05/10/2026";
const BAR = { id: "s-bar", nome: "bar" };
const COZINHA = { id: "s-coz", nome: "cozinha" };

function linha(data: string, sku: string, quantidade: number | null, setor?: { id: string; nome: string }): ItemInventario {
  return {
    data,
    mes: "outubro 2026",
    sku,
    grupo: "HOR",
    nome: sku.toLowerCase(),
    unidadeBase: "KG",
    quantidade,
    precoUnitario: 10,
    total: quantidade === null ? null : quantidade * 10,
    alerta: "",
    id: `${sku}-${setor?.id ?? "legado"}-${data}`,
    setorId: setor?.id ?? null,
    setorNome: setor?.nome ?? null,
  };
}

function andamento(data: string, situacoes: Record<string, "pendente" | "concluido">): [string, AndamentoSetor[]] {
  return [
    data,
    [BAR, COZINHA].map((setor) => ({
      setorId: setor.id,
      setorNome: setor.nome,
      situacao: situacoes[setor.id],
      enviadoEm: null,
      enviadoPor: null,
    })),
  ];
}

describe("escolherDatasContagem", () => {
  const disponiveis = [D12, D11, D05];

  it("sem parametro cai na contagem mais recente", () => {
    expect(escolherDatasContagem(undefined, disponiveis)).toEqual([D12]);
    expect(escolherDatasContagem("", disponiveis)).toEqual([D12]);
    expect(escolherDatasContagem(undefined, [])).toEqual([]);
  });

  it("aceita varias datas separadas por virgula, mais recente primeiro e sem repetir", () => {
    expect(escolherDatasContagem(`${D11},${D12},${D11}`, disponiveis)).toEqual([D12, D11]);
  });

  it("ignora data que nao existe na unidade (entrada do usuario nunca e confiada)", () => {
    expect(escolherDatasContagem(`${D11},31/12/2099,'; drop`, disponiveis)).toEqual([D11]);
    expect(escolherDatasContagem("31/12/2099", disponiveis)).toEqual([D12]);
  });

  it("aceita a chave repetida (?data=a&data=b chega como lista) sem quebrar", () => {
    expect(escolherDatasContagem([D11, D12], disponiveis)).toEqual([D12, D11]);
    expect(escolherDatasContagem([`${D05},${D11}`, D11], disponiveis)).toEqual([D11, D05]);
    expect(escolherDatasContagem([], disponiveis)).toEqual([D12]);
  });
});

describe("listaDoParametro", () => {
  it("normaliza texto, lista e ausente numa lista sem vazios nem repeticao", () => {
    expect(listaDoParametro(undefined)).toEqual([]);
    expect(listaDoParametro("")).toEqual([]);
    expect(listaDoParametro(" PRO , HOR,,PRO ")).toEqual(["PRO", "HOR"]);
    expect(listaDoParametro(["PRO", "HOR,LIM", "PRO"])).toEqual(["PRO", "HOR", "LIM"]);
  });
});

describe("consolidarVariasDatas", () => {
  it("cada setor entra com a sua contagem mais recente e o estoque e a soma dos setores", () => {
    // The House em 11 e 12/10: bar contou no sábado, cozinha no domingo.
    const itens = [linha(D11, "HORFVC001", 18, BAR), linha(D12, "HORFVC001", 5, COZINHA)];
    const { itens: escolhidos, datasPorSku } = consolidarVariasDatas(itens, [D12, D11]);

    expect(quantidadePorSku(escolhidos).get("HORFVC001")).toBe(23);
    expect(datasPorSku.get("HORFVC001")).toEqual([D12, D11]);
  });

  it("o mesmo setor nunca soma duas vezes: contou nas duas datas, vale so a ultima", () => {
    const itens = [
      linha(D11, "HORFVC001", 18, BAR),
      linha(D11, "HORFVC001", 4, COZINHA),
      linha(D12, "HORFVC001", 5, COZINHA),
    ];
    const { itens: escolhidos, datasPorSku } = consolidarVariasDatas(itens, [D11, D12]);

    expect(quantidadePorSku(escolhidos).get("HORFVC001")).toBe(23);
    expect(datasPorSku.get("HORFVC001")).toEqual([D12, D11]);
  });

  it("produto de um setor so fica com a contagem mais recente em que foi contado", () => {
    const itens = [linha(D05, "MERARR001", 9, COZINHA), linha(D11, "MERARR001", 2, COZINHA)];
    const { itens: escolhidos, datasPorSku } = consolidarVariasDatas(itens, [D12, D11, D05]);

    expect(quantidadePorSku(escolhidos).get("MERARR001")).toBe(2);
    expect(datasPorSku.get("MERARR001")).toEqual([D11]);
  });

  it("quantidade nula na data mais recente nao apaga a contagem anterior do setor", () => {
    const itens = [linha(D11, "MERARR001", 7, COZINHA), linha(D12, "MERARR001", null, COZINHA)];
    const { itens: escolhidos } = consolidarVariasDatas(itens, [D12, D11]);

    expect(quantidadePorSku(escolhidos).get("MERARR001")).toBe(7);
  });

  it("so nulos: fica a data mais recente e o item segue 'nao contado'", () => {
    const itens = [linha(D11, "MERARR001", null, COZINHA), linha(D12, "MERARR001", null, COZINHA)];
    const { itens: escolhidos, datasPorSku } = consolidarVariasDatas(itens, [D12, D11]);

    expect(escolhidos.map((l) => l.data)).toEqual([D12]);
    expect(quantidadePorSku(escolhidos).get("MERARR001")).toBeNull();
    expect(datasPorSku.get("MERARR001")).toEqual([]);
  });

  it("contagem sem setor mais recente vale sozinha, sem somar com setor antigo", () => {
    const itens = [linha(D11, "MERARR001", 6, BAR), linha(D12, "MERARR001", 10)];
    const { itens: escolhidos } = consolidarVariasDatas(itens, [D12, D11]);

    expect(quantidadePorSku(escolhidos).get("MERARR001")).toBe(10);
  });

  it("linha sem setor mais antiga que a contagem por setor e ignorada", () => {
    const itens = [linha(D05, "MERARR001", 10), linha(D12, "MERARR001", 6, BAR)];
    const { itens: escolhidos } = consolidarVariasDatas(itens, [D12, D05]);

    expect(quantidadePorSku(escolhidos).get("MERARR001")).toBe(6);
  });

  it("data fora da escolha nao entra; uma data so devolve as linhas dela na ordem original", () => {
    const itens = [linha(D12, "A", 1, BAR), linha(D05, "A", 9, BAR), linha(D12, "B", 2, COZINHA)];
    const { itens: escolhidos } = consolidarVariasDatas(itens, [D12]);

    expect(escolhidos).toEqual([itens[0], itens[2]]);
  });

  it("devolve da data mais antiga pra mais recente, pra 'ultima linha vale' pegar a recente", () => {
    const itens = [linha(D12, "A", 1, BAR), linha(D11, "A", 3, COZINHA)];
    const { itens: escolhidos } = consolidarVariasDatas(itens, [D11, D12]);

    expect(escolhidos.map((l) => l.data)).toEqual([D11, D12]);
  });
});

describe("escopoDeVariasDatas", () => {
  it("une os snapshots sem repetir produto x setor; a data mais recente manda no nome", () => {
    const escopo = new Map<string, EscopoSetor[]>([
      [D11, [{ sku: "A", setorId: BAR.id, setorNome: BAR.nome, nome: "a velho" }]],
      [
        D12,
        [
          { sku: "A", setorId: BAR.id, setorNome: BAR.nome, nome: "a novo" },
          { sku: "A", setorId: COZINHA.id, setorNome: COZINHA.nome },
        ],
      ],
    ]);
    const resultado = escopoDeVariasDatas(escopo, [D11, D12]);

    expect(resultado).toHaveLength(2);
    expect(resultado.find((l) => l.setorId === BAR.id)?.nome).toBe("a novo");
  });
});

describe("andamentoDeVariasDatas", () => {
  it("setor concluido em qualquer data conta como concluido; pendente so quem nao fechou em nenhuma", () => {
    const porData = new Map<string, AndamentoSetor[]>([
      andamento(D11, { [BAR.id]: "concluido", [COZINHA.id]: "pendente" }),
      andamento(D12, { [BAR.id]: "pendente", [COZINHA.id]: "concluido" }),
    ]);

    const resultado = andamentoDeVariasDatas(porData, [D12, D11]);
    expect(resultado.map((s) => [s.setorNome, s.situacao])).toEqual([
      ["bar", "concluido"],
      ["cozinha", "concluido"],
    ]);
  });

  it("pendente nas duas datas segue pendente", () => {
    const porData = new Map<string, AndamentoSetor[]>([
      andamento(D11, { [BAR.id]: "pendente", [COZINHA.id]: "concluido" }),
      andamento(D12, { [BAR.id]: "pendente", [COZINHA.id]: "concluido" }),
    ]);

    const resultado = andamentoDeVariasDatas(porData, [D12, D11]);
    expect(resultado.find((s) => s.setorId === BAR.id)?.situacao).toBe("pendente");
  });
});
