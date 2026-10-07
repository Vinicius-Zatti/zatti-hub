import { describe, expect, it, vi } from "vitest";
import type { Produto } from "@/lib/types";

// Tabela de produtos falsa com a mesma unicidade (unidade_id, sku) do banco:
// insert de chave repetida devolve o erro 23505 do Postgres, sem tocar na
// linha que já existe. A espera antes de gravar deixa as duas chamadas
// "no ar" ao mesmo tempo, como dois cliques simultâneos.
const linhas = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (linha: Record<string, unknown>) => {
        await new Promise((r) => setTimeout(r, 5));
        const repetida = linhas.some((l) => l.unidade_id === linha.unidade_id && l.sku === linha.sku);
        if (repetida) return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        linhas.push(linha);
        return { error: null };
      },
    }),
  }),
}));

const { inserirProdutoBanco } = await import("./estoque");
const { ErroPublico } = await import("@/lib/erros");

function produto(sku: string, nome: string): Produto {
  return {
    sku,
    posicao: null,
    grupo: "PRE",
    nome,
    unidadeBase: "KG",
    precoUnitario: null,
    estoqueNecessarioSemana: null,
    estoqueMinimo: null,
    nomeCompra: nome,
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

describe("criação de produto nunca sobrescreve SKU existente", () => {
  it("duas criações simultâneas do mesmo SKU: uma grava, a outra é recusada com mensagem pública", async () => {
    const resultados = await Promise.allSettled([
      inserirProdutoBanco(produto("PREMAIVER", "maionese verde da casa"), "u1"),
      inserirProdutoBanco(produto("PREMAIVER", "maionese de alho da casa"), "u1"),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusada = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(recusada.reason).toBeInstanceOf(ErroPublico);
    expect(recusada.reason.message).toContain("PREMAIVER");
    expect(linhas.filter((l) => l.sku === "PREMAIVER")).toHaveLength(1);
    expect(linhas.find((l) => l.sku === "PREMAIVER")?.nome).toBe("maionese verde da casa");
  });

  it("mesmo SKU em outra unidade é permitido", async () => {
    await expect(inserirProdutoBanco(produto("PREMAIVER", "maionese verde da casa"), "u2")).resolves.toBeUndefined();
  });
});
