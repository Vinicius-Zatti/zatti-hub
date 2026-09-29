import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoMemoria, type BancoMemoria } from "./banco-memoria-teste";

// Banco em memória que imita o PostgREST com `max_rows`: toda resposta é
// cortada sem erro. Prova que a listagem do inventário junta todas as
// páginas - bug da Dom Quixote em 28/09/2026 (1.165 itens, contagens mais
// recentes sumindo) - e que os cabeçalhos de contagem também não têm teto.
const ref = vi.hoisted(() => ({ banco: null as BancoMemoria | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ref.banco!.cliente }));

const banco = criarBancoMemoria();
ref.banco = banco;
const { listarInventarioBanco } = await import("./estoque");

function montarContagem(id: string, data: string, quantidadeItens: number, unidadeId = "u1") {
  banco.tabelas.contagens.push({ id, unidade_id: unidadeId, data, mes: data.slice(0, 7) });
  for (let i = 0; i < quantidadeItens; i++) {
    banco.tabelas.contagem_itens.push({
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
  banco.limpar();
  banco.tabelas.contagens = [];
  banco.tabelas.contagem_itens = [];
  banco.tabelas.setores = [];
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
    expect(banco.ranges.contagem_itens).toEqual([
      [0, 999],
      [1000, 1999],
      [1165, 2164],
    ]);
  });

  it.each([999, 1000, 1001, 2000])("lê %i itens inteiros", async (total) => {
    montarContagem("c01", "2026-09-20", total);
    expect(await listarInventarioBanco("u1")).toHaveLength(total);
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

  it("teto do servidor menor que 1000 (500) ainda lê tudo", async () => {
    banco.maxRows = 500;
    montarContagem("c01", "2026-09-20", 1234);
    expect(await listarInventarioBanco("u1")).toHaveLength(1234);
  });

  it("mais de 1.000 contagens (cabeçalhos) e contagem_ids em lotes: nada some e a ordem global se mantém", async () => {
    for (let c = 0; c < 1001; c++) {
      montarContagem(`c${String(c).padStart(4, "0")}`, "2026-09-20", 2);
    }
    const itens = await listarInventarioBanco("u1");

    expect(itens).toHaveLength(2002);
    expect(banco.ranges.contagens).toEqual([
      [0, 999],
      [1000, 1999],
      [1001, 2000],
    ]);
    // Mesma ordem que uma consulta só daria: `ordem`, depois contagem e id.
    const esperado = [...banco.tabelas.contagem_itens]
      .sort((a, b) =>
        (a.ordem as number) - (b.ordem as number) || String(a.contagem_id).localeCompare(String(b.contagem_id)),
      )
      .map((l) => l.id);
    expect(itens.map((item) => item.id)).toEqual(esperado);
  });

  it("não mistura contagens de outra unidade", async () => {
    montarContagem("c01", "2026-09-20", 1200);
    montarContagem("x01", "2026-09-21", 900, "u2");
    const itens = await listarInventarioBanco("u1");
    expect(itens).toHaveLength(1200);
    expect(itens.every((item) => String(item.id).startsWith("c01-"))).toBe(true);
  });

  it("erro na segunda página dos itens lança erro, nunca devolve parcial", async () => {
    montarContagem("c01", "2026-09-20", 1500);
    banco.falharNaLeitura.contagem_itens = 2;
    await expect(listarInventarioBanco("u1")).rejects.toThrow("Não foi possível carregar os itens contados");
  });

  it("erro na segunda página dos cabeçalhos lança erro", async () => {
    for (let c = 0; c < 1001; c++) montarContagem(`c${String(c).padStart(4, "0")}`, "2026-09-20", 0);
    banco.falharNaLeitura.contagens = 2;
    await expect(listarInventarioBanco("u1")).rejects.toThrow("Não foi possível carregar as contagens");
  });
});
