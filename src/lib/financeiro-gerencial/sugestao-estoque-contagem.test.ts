import { describe, expect, it } from "vitest";
import type { AndamentoSetor, ModalidadeContagem } from "@/lib/contagem/setor";
import type { ItemInventario } from "@/lib/types";
import { grupoDoItem, sugestaoEstoqueDoMes, sugestoesEstoqueDoAno } from "./sugestao-estoque-contagem";

function item(data: string, quantidade: number | null, preco: number | null, sku = "HORLTA001", grupo = "HOR"): ItemInventario {
  return {
    data,
    mes: "",
    sku,
    grupo,
    nome: sku,
    unidadeBase: "KG",
    quantidade,
    precoUnitario: preco,
    total: quantidade !== null && preco !== null ? quantidade * preco : null,
    alerta: "",
  };
}

function setor(nome: string, situacao: "pendente" | "concluido"): AndamentoSetor {
  return { setorId: nome, setorNome: nome, situacao, enviadoEm: null, enviadoPor: null };
}

const SEM_SETOR = { andamentoPorData: new Map<string, AndamentoSetor[]>(), modalidadePorData: new Map<string, ModalidadeContagem>() };

describe("sugestão de estoque final vinda da Contagem (Fase 3, item 2)", () => {
  it("escolhe a contagem completa mais próxima do fim do mês, com o valor da Contagem", () => {
    const itens = [item("05/09/2026", 2, 10), item("28/09/2026", 3, 10), item("28/09/2026", 1, 50, "CARBOV001"), item("02/10/2026", 9, 10)];
    expect(sugestaoEstoqueDoMes({ competencia: "2026-09", itens, ...SEM_SETOR })).toEqual({
      data: "28/09/2026",
      mercadorias: 80,
      embalagens: 0,
      itensSemValor: 0,
      itensSemGrupo: 0,
    });
  });

  it("contagem por setor com setor pendente não entra: volta para a última completa do mês", () => {
    const itens = [item("10/09/2026", 2, 10), item("29/09/2026", 5, 10)];
    const andamentoPorData = new Map([
      ["10/09/2026", [setor("Bar", "concluido"), setor("Cozinha", "concluido")]],
      ["29/09/2026", [setor("Bar", "concluido"), setor("Cozinha", "pendente")]],
    ]);
    const modalidadePorData = new Map<string, ModalidadeContagem>([
      ["10/09/2026", "setor"],
      ["29/09/2026", "setor"],
    ]);
    expect(sugestaoEstoqueDoMes({ competencia: "2026-09", itens, andamentoPorData, modalidadePorData })?.data).toBe("10/09/2026");
  });

  it("contagem legada conta como completa", () => {
    const itens = [item("30/09/2026", 4, 10)];
    const modalidadePorData = new Map<string, ModalidadeContagem>([["30/09/2026", "legada"]]);
    expect(sugestaoEstoqueDoMes({ competencia: "2026-09", itens, andamentoPorData: new Map(), modalidadePorData })?.mercadorias).toBe(40);
  });

  it("sem contagem completa no mês: null (nunca usa contagem de outro mês)", () => {
    const itens = [item("31/08/2026", 4, 10), item("01/10/2026", 4, 10)];
    expect(sugestaoEstoqueDoMes({ competencia: "2026-09", itens, ...SEM_SETOR })).toBeNull();
  });

  it("conta os itens sem preço ou sem quantidade (valor parcial)", () => {
    const itens = [item("30/09/2026", 2, 10), item("30/09/2026", 3, null, "SEMPRECO1"), item("30/09/2026", null, 5, "SEMQTD001")];
    const s = sugestaoEstoqueDoMes({ competencia: "2026-09", itens, ...SEM_SETOR });
    expect(s?.mercadorias).toBe(20);
    expect(s?.itensSemValor).toBe(2);
  });

  it("separa embalagens (EMB) de mercadorias pelo grupo do SKU (decisão 5, 13/10)", () => {
    const itens = [
      item("30/09/2026", 2, 10),
      item("30/09/2026", 100, 0.5, "EMBCAI001", "EMB"),
      item("30/09/2026", 10, 2, "EMBSAC001", "OPE"), // SKU diz EMB: o SKU manda
      item("30/09/2026", 1, 7, "DESCOP001", "DES"), // descartável interno fica em mercadorias, como antes
    ];
    expect(sugestaoEstoqueDoMes({ competencia: "2026-09", itens, ...SEM_SETOR })).toEqual({
      data: "30/09/2026",
      mercadorias: 27,
      embalagens: 70,
      itensSemValor: 0,
      itensSemGrupo: 0,
    });
  });

  it("SKU fora do padrão usa o grupo do cadastro; sem nenhum dos dois vai para mercadorias e é contado", () => {
    const itens = [
      item("30/09/2026", 4, 1, "CX-123", "EMB"), // SKU antigo, cadastro diz EMB
      item("30/09/2026", 3, 1, "X1", ""), // sem grupo reconhecido
      item("30/09/2026", 2, 1, "ZZZ999", "FOO"), // grupo desconhecido nos dois
    ];
    expect(sugestaoEstoqueDoMes({ competencia: "2026-09", itens, ...SEM_SETOR })).toEqual({
      data: "30/09/2026",
      mercadorias: 5,
      embalagens: 4,
      itensSemValor: 0,
      itensSemGrupo: 2,
    });
    expect(grupoDoItem({ sku: "embcai001", grupo: "" })).toBe("EMB");
    expect(grupoDoItem({ sku: "PREMAIVER", grupo: "" })).toBe("PRE");
    expect(grupoDoItem({ sku: "12", grupo: "lim" })).toBe("LIM");
    expect(grupoDoItem({ sku: "12", grupo: "" })).toBeNull();
  });

  it("ano inteiro: uma sugestão por mês, na ordem da grade", () => {
    const itens = [item("31/01/2026", 1, 10), item("15/03/2026", 2, 10)];
    const ano = sugestoesEstoqueDoAno({ ano: 2026, itens, ...SEM_SETOR });
    expect(ano).toHaveLength(12);
    expect(ano[0]?.mercadorias).toBe(10);
    expect(ano[1]).toBeNull();
    expect(ano[2]?.data).toBe("15/03/2026");
  });
});
