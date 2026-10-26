import { beforeEach, describe, expect, it, vi } from "vitest";

// Custo do pré-preparo depois que o chef salva a ficha (26/10/2026): o preço do produto vai pelo
// servidor (o chef não grava produto) e nada calado quando nenhuma linha muda.

vi.mock("server-only", () => ({}));

type Resposta = { data: unknown; error: unknown };
function cliente(respostaUpdate: () => Resposta) {
  const updates: unknown[] = [];
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    let ehUpdate = false;
    for (const m of ["eq", "in", "order", "range", "or"]) q[m] = vi.fn(() => q);
    q.update = vi.fn((v: unknown) => {
      ehUpdate = true;
      updates.push(v);
      return q;
    });
    q.select = vi.fn(() => {
      if (ehUpdate) return Promise.resolve(respostaUpdate());
      return q;
    });
    q.then = (ok: (v: Resposta) => unknown) => Promise.resolve({ data: [{ sku: "PRE000001", preco_unitario: 1 }], error: null }).then(ok);
    return q;
  });
  return { from, updates };
}

let usuario = cliente(() => ({ data: [], error: null }));
let servidor = cliente(() => ({ data: [{ sku: "PRE000001" }], error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => usuario) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => servidor) }));
vi.mock("@/lib/banco/pre-preparo-leitura", () => ({ prePreparoVinculadoHabilitado: vi.fn(async () => true) }));
vi.mock("@/lib/banco/paginacao", () => ({
  buscarTudo: vi.fn(async () => [{ sku: "PRE000001", pre_preparo: true, ficha_pre_preparo_id: "f1", ficha: { status: "ativa" } }]),
}));
vi.mock("@/lib/banco/fichas-tecnicas", () => ({ calcularCustoFicha: vi.fn(async () => ({})) }));
vi.mock("@/lib/banco/estoque", () => ({ linhaProdutoBanco: vi.fn() }));
let precoCalculado = 5;
vi.mock("@/lib/pre-preparo", () => ({ precoDoCustoDaFicha: vi.fn(() => precoCalculado) }));

const { sincronizarCustosPrePreparo } = await import("./pre-preparo");

beforeEach(() => {
  usuario = cliente(() => ({ data: [], error: null }));
  servidor = cliente(() => ({ data: [{ sku: "PRE000001" }], error: null }));
  precoCalculado = 5;
});

describe("sincronizarCustosPrePreparo", () => {
  it("pelo servidor: o preço calculado grava no produto mesmo para quem não grava produto", async () => {
    // Na segunda passada o preço já é o novo: para.
    let chamadas = 0;
    servidor = cliente(() => {
      chamadas += 1;
      return { data: [{ sku: "PRE000001" }], error: null };
    });
    await sincronizarCustosPrePreparo("loja", { escritaPeloServidor: true });
    expect(servidor.updates).toEqual([expect.objectContaining({ preco_unitario: 5 })]);
    expect(usuario.updates).toEqual([]);
    expect(chamadas).toBe(1);
  });

  it("nenhuma linha gravada vira aviso no log, sem quebrar", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await sincronizarCustosPrePreparo("loja");
    expect(usuario.updates).toHaveLength(1);
    expect(erro).toHaveBeenCalledWith(expect.stringMatching(/não gravou nenhuma linha/));
    erro.mockRestore();
  });
});
