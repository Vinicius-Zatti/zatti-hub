import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória que imita o PostgREST com `max_rows = 1000`: toda resposta
// é cortada em 1.000 linhas, sem erro. Prova que a listagem do inventário
// junta todas as páginas - bug da Dom Quixote em 28/09/2026 (1.165 itens,
// contagens mais recentes sumindo).
type Linha = Record<string, unknown>;
const MAX_ROWS = 1000;
const tabelas: Record<string, Linha[]> = {};
const ranges: [number, number][] = [];

function construtor(tabela: string) {
  const filtros: ((l: Linha) => boolean)[] = [];
  const ordens: string[] = [];
  let faixa: [number, number] | null = null;
  function executar() {
    const alvo = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
    alvo.sort((a, b) => {
      for (const campo of ordens) {
        const x = a[campo] as string | number;
        const y = b[campo] as string | number;
        if (x < y) return -1;
        if (x > y) return 1;
      }
      return 0;
    });
    const [de, ate] = faixa ?? [0, alvo.length - 1];
    const fatia = alvo.slice(de, Math.min(ate + 1, de + MAX_ROWS));
    return { data: fatia, error: null };
  }
  const b = {
    select() {
      return b;
    },
    eq(campo: string, valor: unknown) {
      filtros.push((l) => l[campo] === valor);
      return b;
    },
    in(campo: string, lista: unknown[]) {
      filtros.push((l) => lista.includes(l[campo]));
      return b;
    },
    order(campo: string) {
      ordens.push(campo);
      return b;
    },
    range(de: number, ate: number) {
      faixa = [de, ate];
      ranges.push([de, ate]);
      return b;
    },
    then<R>(ok: (v: ReturnType<typeof executar>) => R) {
      return Promise.resolve(executar()).then(ok);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => construtor(t) }) }));

const { listarInventarioBanco } = await import("./estoque");

function montarContagem(id: string, data: string, quantidadeItens: number) {
  tabelas.contagens.push({ id, unidade_id: "u1", data, mes: data.slice(0, 7) });
  for (let i = 0; i < quantidadeItens; i++) {
    tabelas.contagem_itens.push({
      id: `${id}-${String(i).padStart(4, "0")}`,
      contagem_id: id,
      setor_id: null,
      sku: `SKU${i}`,
      grupo: "G",
      nome: `Item ${i}`,
      unidade_base: "un",
      quantidade: 1,
      preco_unitario: 2,
      total: 2,
      alerta: "",
      ordem: i,
    });
  }
}

beforeEach(() => {
  tabelas.contagens = [];
  tabelas.contagem_itens = [];
  tabelas.setores = [];
  ranges.length = 0;
});

describe("listarInventarioBanco - paginação acima de 1.000 linhas", () => {
  it("traz todos os itens de todas as contagens, sem pular nem repetir", async () => {
    montarContagem("c01", "2026-09-20", 600);
    montarContagem("c02", "2026-09-24", 485);
    montarContagem("c03", "2026-09-28", 80);

    const itens = await listarInventarioBanco("u1");

    expect(itens).toHaveLength(1165);
    expect(new Set(itens.map((item) => item.id)).size).toBe(1165);
    expect(itens.filter((item) => item.data === "28/09/2026")).toHaveLength(80);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("mantém a ordem por `ordem`, como antes", async () => {
    montarContagem("c01", "2026-09-20", 3);
    montarContagem("c02", "2026-09-28", 2);

    const itens = await listarInventarioBanco("u1");

    expect(itens.map((item) => item.id)).toEqual([
      "c01-0000",
      "c02-0000",
      "c01-0001",
      "c02-0001",
      "c01-0002",
    ]);
  });

  it("para na primeira página quando cabe tudo nela", async () => {
    montarContagem("c01", "2026-09-20", 430);

    expect(await listarInventarioBanco("u1")).toHaveLength(430);
    expect(ranges).toEqual([[0, 999]]);
  });
});
