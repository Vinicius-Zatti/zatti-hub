import { beforeEach, describe, expect, it, vi } from "vitest";

// Revisão do Estoque (21/10/2026): confirmar item na cotação.
// - Dois itens do mesmo fornecedor confirmados juntos: a segunda criação do
//   pedido bate na unicidade (23505) e precisa reaproveitar o pedido criado.
// - SKU repetido no mesmo pedido (há em produção): confirmar não pode travar.
type Linha = Record<string, unknown>;
type Resposta = { data: unknown; error: { code?: string; message: string } | null };

const estado = vi.hoisted(() => ({
  pedidos: [] as Record<string, unknown>[],
  itens: [] as Record<string, unknown>[],
  /** Pedido que "outra chamada" cria entre o select e o insert. */
  corridaNoInsert: false,
}));

function consulta(tabela: "pedidos" | "pedido_itens") {
  const filtros: ((l: Linha) => boolean)[] = [];
  let operacao: "select" | "insert" | "update" = "select";
  let valores: Linha = {};
  let limite: number | null = null;
  const lista = () => (tabela === "pedidos" ? estado.pedidos : estado.itens);
  const filtradas = () => lista().filter((l) => filtros.every((f) => f(l)));

  function executar(modo: "lista" | "maybeSingle" | "single"): Resposta {
    if (operacao === "insert") {
      if (tabela === "pedidos" && estado.corridaNoInsert) {
        estado.corridaNoInsert = false;
        estado.pedidos.push({ id: "criado-ao-lado", ...valores });
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const nova = { id: `${tabela}-${lista().length + 1}`, ...valores };
      lista().push(nova);
      return { data: modo === "lista" ? [nova] : nova, error: null };
    }
    if (operacao === "update") {
      for (const linha of filtradas()) Object.assign(linha, valores);
      return { data: null, error: null };
    }
    let linhas = filtradas();
    if (limite !== null) linhas = linhas.slice(0, limite);
    if (modo === "maybeSingle") {
      if (linhas.length > 1) return { data: null, error: { message: "multiple rows" } };
      return { data: linhas[0] ?? null, error: null };
    }
    return { data: linhas, error: null };
  }

  const q = {
    select: () => q,
    insert: (v: Linha) => ((operacao = "insert"), (valores = v), q),
    update: (v: Linha) => ((operacao = "update"), (valores = v), q),
    eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
    neq: (c: string, v: unknown) => (filtros.push((l) => l[c] !== v), q),
    in: (c: string, v: unknown[]) => (filtros.push((l) => v.includes(l[c])), q),
    order: () => q,
    range: () => q,
    limit: (n: number) => ((limite = n), q),
    maybeSingle: async () => executar("maybeSingle"),
    single: async () => executar("single"),
    then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(executar("lista")).then(ok, falha),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (tabela: "pedidos" | "pedido_itens") => consulta(tabela) }),
}));

const { confirmarItem } = await import("./pedidos");

const item = {
  sku: "PROCDB001",
  nome: "costela de boi",
  nomeCompra: "",
  unidadeBase: "KG",
  quantidadePedida: 12,
  precoAntigo: 23.5,
  precoAtualizado: 23.5,
  precoConfirmado: false,
};

function confirmar(quantidadePedida: number) {
  return confirmarItem({
    unidadeId: "u1",
    fornecedor: "xavier carnes",
    dataContagemBase: "19/10/2026",
    item: { ...item, quantidadePedida },
    atualizarPreco: false,
    criadoPor: "user-1",
  });
}

beforeEach(() => {
  estado.pedidos = [];
  estado.itens = [];
  estado.corridaNoInsert = false;
});

describe("confirmarItem", () => {
  it("pedido criado ao lado (23505) é reaproveitado, sem erro", async () => {
    estado.corridaNoInsert = true;
    await expect(confirmar(12)).resolves.toBeUndefined();
    expect(estado.pedidos).toHaveLength(1);
    expect(estado.itens).toHaveLength(1);
    expect(estado.itens[0]).toMatchObject({ pedido_id: "criado-ao-lado", quantidade_pedida: 12 });
  });

  it("SKU repetido no pedido não trava a confirmação e as linhas ficam iguais", async () => {
    estado.pedidos.push({ id: "p1", unidade_id: "u1", fornecedor: "xavier carnes", data_contagem_base: "19/10/2026" });
    estado.itens.push(
      { id: "i1", pedido_id: "p1", sku: "PROCDB001", quantidade_pedida: 3 },
      { id: "i2", pedido_id: "p1", sku: "PROCDB001", quantidade_pedida: 5 },
    );
    await expect(confirmar(12)).resolves.toBeUndefined();
    expect(estado.itens).toHaveLength(2);
    expect(estado.itens.map((l) => l.quantidade_pedida)).toEqual([12, 12]);
  });
});
