import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoMemoria, type BancoMemoria } from "./banco-memoria-teste";

// Produtos, designação produto x setor, andamento e escopo da contagem por
// setor sem o teto de 1.000 linhas do PostgREST. Banco em memória corta toda
// resposta em `max_rows`, sem avisar.
const ref = vi.hoisted(() => ({ banco: null as BancoMemoria | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ref.banco!.cliente }));

const banco = criarBancoMemoria();
ref.banco = banco;
const { listarProdutosBanco, listarFornecedoresBanco } = await import("./estoque");
const { listarSetoresBanco, listarDesignacoesBanco, listarAndamentoBanco, listarEscopoBanco } = await import("./setores");

const pad = (n: number) => String(n).padStart(5, "0");

function produtos(total: number, unidadeId = "u1") {
  for (let i = 0; i < total; i++) {
    banco.tabelas.produtos.push({
      id: `${unidadeId}-prod-${pad(i)}`,
      unidade_id: unidadeId,
      ordem: i,
      sku: `${unidadeId}-SKU${pad(i)}`,
      posicao: "",
      grupo: "G",
      nome: `Produto ${i}`,
      unidade_base: "un",
      preco_unitario: 1,
      ativo: true,
      revenda: false,
    });
  }
}

function setor(id: string, unidadeId = "u1") {
  banco.tabelas.setores.push({ id, unidade_id: unidadeId, nome: `Setor ${id}`, ordem: 1, ativo: true });
}

function contagem(id: string, data: string, unidadeId = "u1") {
  banco.tabelas.contagens.push({ id, unidade_id: unidadeId, data, mes: data.slice(0, 7) });
}

/** A contagem de leituras é acumulada por tabela: a "segunda página da
 * próxima chamada" vem depois de todas as leituras já feitas. */
const segundaPaginaDaProxima = (tabela: string) => (banco.ranges[tabela]?.length ?? 0) + 2;

beforeEach(() => {
  banco.limpar();
  for (const t of ["produtos", "fornecedores", "setores", "produto_setores", "contagens", "contagem_setores", "contagem_escopo"]) {
    banco.tabelas[t] = [];
  }
});

describe("listarProdutosBanco - sem teto de linhas", () => {
  it.each([999, 1000, 1001, 2000])("lê %i produtos inteiros, na ordem de sempre", async (total) => {
    produtos(total);
    const lidos = await listarProdutosBanco("u1");
    expect(lidos).toHaveLength(total);
    expect(lidos.map((p) => p.sku)).toEqual(banco.tabelas.produtos.map((p) => p.sku));
  });

  it("teto do servidor menor que 1000 (500) ainda lê tudo", async () => {
    banco.maxRows = 500;
    produtos(1234);
    expect(await listarProdutosBanco("u1")).toHaveLength(1234);
  });

  it("erro na segunda página lança erro, nunca devolve parcial", async () => {
    produtos(1500);
    banco.falharNaLeitura.produtos = 2;
    await expect(listarProdutosBanco("u1")).rejects.toThrow("Não foi possível carregar os produtos");
  });

  it("não mistura produtos de outra unidade", async () => {
    produtos(1100);
    produtos(900, "u2");
    const lidos = await listarProdutosBanco("u1");
    expect(lidos).toHaveLength(1100);
    expect(lidos.every((p) => p.sku.startsWith("u1-"))).toBe(true);
  });
});

describe("listarFornecedoresBanco - sem teto de linhas", () => {
  it("lê 1001 fornecedores e propaga erro na segunda página", async () => {
    for (let i = 0; i < 1001; i++) {
      banco.tabelas.fornecedores.push({ id: `f${pad(i)}`, unidade_id: "u1", ordem: i, codigo: `F${i}`, razao_social: "", grupos: [] });
    }
    expect(await listarFornecedoresBanco("u1")).toHaveLength(1001);
    banco.falharNaLeitura.fornecedores = segundaPaginaDaProxima("fornecedores");
    await expect(listarFornecedoresBanco("u1")).rejects.toThrow("Não foi possível carregar os fornecedores");
  });
});

describe("designação produto x setor - sem teto de linhas", () => {
  function designar(total: number, unidadeId = "u1") {
    setor(`${unidadeId}-s1`, unidadeId);
    setor(`${unidadeId}-s2`, unidadeId);
    produtos(total, unidadeId);
    for (let i = 0; i < total; i++) {
      banco.tabelas.produto_setores.push({
        produto_id: `${unidadeId}-prod-${pad(i)}`,
        setor_id: i % 2 ? `${unidadeId}-s2` : `${unidadeId}-s1`,
        unidade_id: unidadeId,
      });
    }
  }

  it.each([999, 1000, 1001, 2000])("conta %i vínculos inteiros por setor", async (total) => {
    designar(total);
    const setores = await listarSetoresBanco("u1");
    expect(setores.reduce((s, x) => s + x.produtos, 0)).toBe(total);
  });

  it.each([1001, 2000])("designação lê %i SKUs inteiros", async (total) => {
    designar(total);
    expect((await listarDesignacoesBanco("u1")).size).toBe(total);
  });

  it("teto 500, isolamento por unidade e erro na segunda página", async () => {
    banco.maxRows = 500;
    designar(1234);
    designar(800, "u2");
    expect((await listarDesignacoesBanco("u1")).size).toBe(1234);
    banco.falharNaLeitura.produto_setores = segundaPaginaDaProxima("produto_setores");
    await expect(listarSetoresBanco("u1")).rejects.toThrow("Não foi possível contar os produtos");
  });
});

describe("andamento e escopo da contagem por setor - sem teto de linhas", () => {
  it("andamento: mais de 1.000 linhas de setor por contagem, sem outra unidade", async () => {
    for (let s = 0; s < 3; s++) setor(`s${s}`);
    setor("x0", "u2");
    for (let c = 0; c < 400; c++) {
      const id = `c${pad(c)}`;
      contagem(id, `2025-${String((c % 12) + 1).padStart(2, "0")}-${String((c % 28) + 1).padStart(2, "0")}`);
      for (let s = 0; s < 3; s++) {
        banco.tabelas.contagem_setores.push({ id: `${id}-s${s}`, contagem_id: id, setor_id: `s${s}`, situacao: "concluido" });
      }
    }
    contagem("x", "2025-01-01", "u2");
    banco.tabelas.contagem_setores.push({ id: "x-s", contagem_id: "x", setor_id: "x0", situacao: "pendente" });

    const porData = await listarAndamentoBanco("u1");
    const linhas = [...porData.values()].flat();
    expect(linhas).toHaveLength(1200);
    expect(linhas.every((l) => l.setorId !== "x0")).toBe(true);

    banco.falharNaLeitura.contagem_setores = segundaPaginaDaProxima("contagem_setores");
    await expect(listarAndamentoBanco("u1")).rejects.toThrow("Não foi possível carregar o andamento");
  });

  it.each([999, 1000, 1001, 2000])("escopo da data lê %i SKUs inteiros", async (total) => {
    setor("s1");
    contagem("c1", "2026-09-20");
    contagem("c2", "2026-09-27");
    contagem("x", "2026-09-20", "u2");
    for (let i = 0; i < total; i++) {
      banco.tabelas.contagem_escopo.push({ contagem_id: "c1", setor_id: "s1", sku: `SKU${pad(i)}` });
      banco.tabelas.contagem_escopo.push({ contagem_id: "c2", setor_id: "s1", sku: `SKU${pad(i)}` });
      banco.tabelas.contagem_escopo.push({ contagem_id: "x", setor_id: "s1", sku: `SKU${pad(i)}` });
    }
    const escopo = await listarEscopoBanco("u1", "20/09/2026");
    expect(escopo).toHaveLength(total);
    expect(new Set(escopo.map((e) => e.sku)).size).toBe(total);
  });

  it("escopo: teto 500 e erro na segunda página", async () => {
    banco.maxRows = 500;
    setor("s1");
    contagem("c1", "2026-09-20");
    for (let i = 0; i < 1234; i++) banco.tabelas.contagem_escopo.push({ contagem_id: "c1", setor_id: "s1", sku: `SKU${pad(i)}` });
    expect(await listarEscopoBanco("u1", "20/09/2026")).toHaveLength(1234);
    banco.falharNaLeitura.contagem_escopo = segundaPaginaDaProxima("contagem_escopo");
    await expect(listarEscopoBanco("u1", "20/09/2026")).rejects.toThrow("Não foi possível carregar o escopo");
  });
});
