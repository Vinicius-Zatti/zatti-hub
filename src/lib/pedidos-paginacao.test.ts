import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoMemoria, type BancoMemoria } from "./banco/banco-memoria-teste";

// Pedidos sem o teto de 1.000 linhas do PostgREST: cabeçalhos e itens lidos
// por completo (itens em lotes de pedidos, cada lote paginado). Banco em
// memória corta toda resposta em `max_rows`, sem avisar.
const ref = vi.hoisted(() => ({ banco: null as BancoMemoria | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ref.banco!.cliente }));

const banco = criarBancoMemoria();
ref.banco = banco;
const { listPedidosFeitos, listPedidosPorContagemBase } = await import("./pedidos");

const pad = (n: number) => String(n).padStart(5, "0");

function pedido(id: string, criadoEm: string, extra: Record<string, unknown> = {}) {
  banco.tabelas.pedidos.push({
    id,
    unidade_id: "u1",
    fornecedor: `F-${id}`,
    data_contagem_base: "2026-09-20",
    previsao_entrega: null,
    observacao_entrega: null,
    recebido: false,
    criado_em: criadoEm,
    atualizado_em: criadoEm,
    ...extra,
  });
}

function itens(pedidoId: string, quantidade: number) {
  for (let i = 0; i < quantidade; i++) {
    banco.tabelas.pedido_itens.push({
      id: `${pedidoId}-${pad(i)}`,
      pedido_id: pedidoId,
      sku: `SKU${i}`,
      nome: `Item ${i}`,
      nome_compra: null,
      unidade_base: "un",
      quantidade_pedida: 1,
      quantidade_recebida: null,
      preco_antigo: null,
      preco_atualizado: 2,
      preco_confirmado: false,
      vencedor_confirmado: true,
    });
  }
}

const totalItens = (pedidos: { itens: unknown[] }[]) => pedidos.reduce((s, p) => s + p.itens.length, 0);

beforeEach(() => {
  banco.limpar();
  banco.tabelas.pedidos = [];
  banco.tabelas.pedido_itens = [];
});

describe("listPedidosFeitos - sem teto de linhas", () => {
  it.each([999, 1000, 1001, 2000])("lê %i itens de um pedido inteiros", async (total) => {
    pedido("p1", "2026-09-20T10:00:00Z");
    itens("p1", total);
    const pedidos = await listPedidosFeitos("u1");
    expect(pedidos[0].itens).toHaveLength(total);
    expect(new Set(pedidos[0].itens.map((i) => i.sku)).size).toBe(total);
  });

  it.each([999, 1000, 1001, 2000])("lê %i pedidos (cabeçalhos) inteiros, mais recente primeiro", async (total) => {
    for (let i = 0; i < total; i++) pedido(`p${pad(i)}`, `2026-01-01T00:00:00.${pad(i)}Z`);
    const pedidos = await listPedidosFeitos("u1");
    expect(pedidos).toHaveLength(total);
    expect(pedidos[0].id).toBe(`p${pad(total - 1)}`);
    expect(pedidos[total - 1].id).toBe("p00000");
  });

  it("muitos itens por poucos pedidos: nada some", async () => {
    pedido("pa", "2026-09-20T10:00:00Z");
    pedido("pb", "2026-09-21T10:00:00Z");
    itens("pa", 1500);
    itens("pb", 700);
    const pedidos = await listPedidosFeitos("u1");
    expect(pedidos.map((p) => [p.id, p.itens.length])).toEqual([
      ["pb", 700],
      ["pa", 1500],
    ]);
  });

  it("teto do servidor menor que 1000 (500) ainda lê tudo", async () => {
    banco.maxRows = 500;
    for (let i = 0; i < 1234; i++) pedido(`p${pad(i)}`, `2026-01-01T00:00:00.${pad(i)}Z`);
    itens("p00000", 1234);
    const pedidos = await listPedidosFeitos("u1");
    expect(pedidos).toHaveLength(1234);
    expect(totalItens(pedidos)).toBe(1234);
  });

  it("erro na segunda página dos itens lança erro, nunca devolve parcial", async () => {
    pedido("p1", "2026-09-20T10:00:00Z");
    itens("p1", 1500);
    banco.falharNaLeitura.pedido_itens = 2;
    await expect(listPedidosFeitos("u1")).rejects.toThrow("Não foi possível carregar os itens dos pedidos");
  });

  it("erro na segunda página dos pedidos lança erro", async () => {
    for (let i = 0; i < 1001; i++) pedido(`p${pad(i)}`, `2026-01-01T00:00:00.${pad(i)}Z`);
    banco.falharNaLeitura.pedidos = 2;
    await expect(listPedidosFeitos("u1")).rejects.toThrow("Não foi possível carregar os pedidos");
  });

  it("não mistura pedidos de outra unidade", async () => {
    pedido("p1", "2026-09-20T10:00:00Z");
    pedido("x1", "2026-09-21T10:00:00Z", { unidade_id: "u2" });
    itens("p1", 1100);
    itens("x1", 900);
    const pedidos = await listPedidosFeitos("u1");
    expect(pedidos.map((p) => p.id)).toEqual(["p1"]);
    expect(pedidos[0].itens).toHaveLength(1100);
  });
});

describe("listPedidosPorContagemBase - sem teto de linhas", () => {
  it.each([999, 1000, 1001, 2000])("lê %i itens espalhados entre pedidos da data", async (total) => {
    pedido("p1", "2026-09-20T10:00:00Z");
    pedido("p2", "2026-09-20T11:00:00Z");
    itens("p1", Math.ceil(total / 2));
    itens("p2", Math.floor(total / 2));
    expect(totalItens(await listPedidosPorContagemBase("u1", "2026-09-20"))).toBe(total);
  });

  it("mais de 100 pedidos (vários lotes de ids) e outra data ficam de fora", async () => {
    for (let i = 0; i < 250; i++) {
      pedido(`p${pad(i)}`, "2026-09-20T10:00:00Z");
      itens(`p${pad(i)}`, 5);
    }
    pedido("outra", "2026-09-20T10:00:00Z", { data_contagem_base: "2026-09-27" });
    itens("outra", 5);
    const pedidos = await listPedidosPorContagemBase("u1", "2026-09-20");
    expect(pedidos).toHaveLength(250);
    expect(totalItens(pedidos)).toBe(1250);
  });

  it("erro na segunda página lança erro", async () => {
    pedido("p1", "2026-09-20T10:00:00Z");
    itens("p1", 1200);
    banco.falharNaLeitura.pedido_itens = 2;
    await expect(listPedidosPorContagemBase("u1", "2026-09-20")).rejects.toThrow();
  });
});
