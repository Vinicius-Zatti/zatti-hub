import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoMemoria, type BancoMemoria } from "./banco/banco-memoria-teste";

// Etapa 2 do fim do teto de 1.000 linhas do PostgREST: Consolidado de vendas
// (e nomes de autores), baixas de uma parcela, lançamentos do Meu Tempo e
// cadastros das Fichas Técnicas. Banco em memória corta toda resposta em
// `max_rows`, sem avisar.
const ref = vi.hoisted(() => ({ banco: null as BancoMemoria | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ref.banco!.cliente }));

const banco = criarBancoMemoria();
ref.banco = banco;
const { listConsolidados } = await import("./consolidado-vendas");
const { listarBaixasDaParcela, nomesPorUserId } = await import("./banco/financeiro-gerencial");
const { listarLancamentosTempo } = await import("./banco/meu-tempo");
const { contarFichasPorCategoria, listarConversoesProduto, custosUnitariosProdutos } = await import("./banco/fichas-tecnicas");

const pad = (n: number) => String(n).padStart(5, "0");
/** Leituras acumulam por tabela: a 2ª página da próxima chamada vem depois delas. */
const segundaPaginaDaProxima = (tabela: string) => (banco.ranges[tabela]?.length ?? 0) + 2;

/** Data ISO distinta por índice (um lançamento por dia). */
function dia(i: number): string {
  const d = new Date(Date.UTC(2020, 0, 1) + i * 86_400_000);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  banco.limpar();
  for (const t of ["consolidados_vendas", "perfis", "fin_baixas", "zh_tempo_lancamentos", "fichas_tecnicas", "produto_conversoes", "produtos"]) {
    banco.tabelas[t] = [];
  }
});

describe("listConsolidados - sem teto de linhas", () => {
  function consolidados(total: number, unidadeId = "u1") {
    for (let i = 0; i < total; i++) {
      banco.tabelas.consolidados_vendas.push({
        id: `${unidadeId}-cv-${pad(i)}`,
        unidade_id: unidadeId,
        data: dia(i),
        faturamento_total: 100,
        status: "conferido",
        criado_por: `user${i % 3}`,
        atualizado_por: null,
      });
    }
  }

  it.each([999, 1000, 1001, 2000])("lê %i dias inteiros, mais recente primeiro", async (total) => {
    consolidados(total);
    const lista = await listConsolidados("u1");
    expect(lista).toHaveLength(total);
    expect(lista[0].data).toBe(dia(total - 1));
    expect(lista[total - 1].data).toBe(dia(0));
  });

  it("teto 500, filtro de período e isolamento por unidade", async () => {
    banco.maxRows = 500;
    consolidados(1500);
    consolidados(700, "u2");
    expect(await listConsolidados("u1")).toHaveLength(1500);
    expect(await listConsolidados("u1", { de: dia(100), ate: dia(1299) })).toHaveLength(1200);
  });

  it("erro na segunda página lança erro, nunca devolve parcial", async () => {
    consolidados(1500);
    banco.falharNaLeitura.consolidados_vendas = 2;
    await expect(listConsolidados("u1")).rejects.toThrow();
  });

  it("falha ao ler os nomes dos autores lança erro", async () => {
    consolidados(10);
    banco.falharNaLeitura.perfis = 1;
    await expect(listConsolidados("u1")).rejects.toThrow();
  });
});

describe("nomesPorUserId (Financeiro) - ids em lotes", () => {
  it("mais de 1.000 autores: todos com nome, sem fallback indevido", async () => {
    const ids = Array.from({ length: 1234 }, (_, i) => `user${pad(i)}`);
    for (const id of ids) banco.tabelas.perfis.push({ id, nome: `Nome ${id}` });
    const nomes = await nomesPorUserId(banco.cliente as never, ids);
    expect(nomes.size).toBe(1234);
    expect(nomes.get("user01233")).toBe("Nome user01233");
  });

  it("erro na leitura lança erro, nunca vira 'Usuário'", async () => {
    banco.tabelas.perfis.push({ id: "a", nome: "A" });
    banco.falharNaLeitura.perfis = 1;
    await expect(nomesPorUserId(banco.cliente as never, ["a"])).rejects.toThrow();
  });
});

describe("listarBaixasDaParcela - leitura completa", () => {
  function baixas(total: number, parcelaId = "par1", unidadeId = "u1") {
    for (let i = 0; i < total; i++) {
      banco.tabelas.fin_baixas.push({
        id: `${parcelaId}-b${pad(i)}`,
        unidade_id: unidadeId,
        parcela_id: parcelaId,
        tipo: "baixa",
        estorno_de_baixa_id: null,
        conta_financeira_id: "conta1",
        valor: 1,
        data: dia(i),
        observacao: "",
        criado_por: "user1",
        criado_em: `${dia(i)}T00:00:00Z`,
      });
    }
  }

  it.each([999, 1000, 1001])("lê %i baixas inteiras, em ordem de data", async (total) => {
    baixas(total);
    baixas(50, "outra");
    const lidas = await listarBaixasDaParcela("u1", "par1");
    expect(lidas).toHaveLength(total);
    expect(lidas[0].data).toBe(dia(0));
  });

  it("erro na segunda página lança erro", async () => {
    baixas(1200);
    banco.falharNaLeitura.fin_baixas = 2;
    await expect(listarBaixasDaParcela("u1", "par1")).rejects.toThrow();
  });
});

describe("listarLancamentosTempo - sem teto de linhas", () => {
  function lancamentos(total: number, userId = "user1") {
    for (let i = 0; i < total; i++) {
      banco.tabelas.zh_tempo_lancamentos.push({
        id: `${userId}-t${pad(i)}`,
        criado_por: userId,
        frente_id: "f1",
        data: dia(Math.floor(i / 4)),
        hora_inicio: null,
        hora_fim: null,
        duracao_minutos: 30,
        tipo_trabalho: "execucao",
        observacao: "",
        origem: "manual",
        status: "encerrado",
        zh_tempo_frentes: { nome: "Frente" },
      });
    }
  }

  it.each([999, 1000, 1001, 2000])("lê %i lançamentos inteiros, mais recente primeiro", async (total) => {
    lancamentos(total);
    lancamentos(300, "outra-pessoa");
    const lidos = await listarLancamentosTempo("user1");
    expect(lidos).toHaveLength(total);
    expect(lidos[0].data).toBe(dia(Math.floor((total - 1) / 4)));
  });

  it("teto 500 e erro na segunda página", async () => {
    banco.maxRows = 500;
    lancamentos(1234);
    expect(await listarLancamentosTempo("user1")).toHaveLength(1234);
    banco.falharNaLeitura.zh_tempo_lancamentos = segundaPaginaDaProxima("zh_tempo_lancamentos");
    await expect(listarLancamentosTempo("user1")).rejects.toThrow("Não foi possível carregar os lançamentos de tempo");
  });
});

describe("Fichas Técnicas - cadastros sem teto de linhas", () => {
  it("conta 1001 fichas por categoria e propaga erro na segunda página", async () => {
    for (let i = 0; i < 1001; i++) {
      banco.tabelas.fichas_tecnicas.push({ id: `fi${pad(i)}`, unidade_id: "u1", categoria_id: i % 2 ? "a" : "b" });
    }
    banco.tabelas.fichas_tecnicas.push({ id: "x", unidade_id: "u2", categoria_id: "a" });
    expect(await contarFichasPorCategoria("u1")).toEqual({ a: 500, b: 501 });
    banco.falharNaLeitura.fichas_tecnicas = segundaPaginaDaProxima("fichas_tecnicas");
    await expect(contarFichasPorCategoria("u1")).rejects.toThrow("Não foi possível contar as fichas");
  });

  it("lê 1001 conversões de produto", async () => {
    for (let i = 0; i < 1001; i++) {
      banco.tabelas.produto_conversoes.push({
        unidade_id: "u1",
        produto_sku: `SKU${pad(i)}`,
        unidade_saida: "g",
        fator_por_unidade_base: 1000,
        fator_correcao: 1,
        descricao: "",
      });
    }
    expect(await listarConversoesProduto("u1")).toHaveLength(1001);
  });

  it("custo unitário lê preços e conversões de mais de 1.000 SKUs e aplica o fator", async () => {
    const skus: string[] = [];
    for (let i = 0; i < 1001; i++) {
      const sku = `SKU${pad(i)}`;
      skus.push(sku);
      banco.tabelas.produtos.push({ id: `p${pad(i)}`, unidade_id: "u1", sku, preco_unitario: 10 });
      banco.tabelas.produto_conversoes.push({ unidade_id: "u1", produto_sku: sku, fator_por_unidade_base: 1000, fator_correcao: 1 });
    }
    const custos = await custosUnitariosProdutos(banco.cliente as never, "u1", skus);
    expect(custos.size).toBe(1001);
    expect(custos.get("SKU01000")).toBeCloseTo(0.01, 6);
  });

  it("falha ao ler conversões lança erro, nunca custo com fator 1", async () => {
    banco.tabelas.produtos.push({ id: "p1", unidade_id: "u1", sku: "A", preco_unitario: 10 });
    banco.tabelas.produto_conversoes.push({ unidade_id: "u1", produto_sku: "A", fator_por_unidade_base: 1000, fator_correcao: 1 });
    banco.falharNaLeitura.produto_conversoes = segundaPaginaDaProxima("produto_conversoes") - 1;
    await expect(custosUnitariosProdutos(banco.cliente as never, "u1", ["A"])).rejects.toThrow("conversões");
  });
});
