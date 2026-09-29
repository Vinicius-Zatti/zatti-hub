import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoMemoria, type BancoMemoria, type Linha } from "./banco-memoria-teste";

// Leituras do Financeiro Gerencial sem o teto de 1.000 linhas do PostgREST:
// lista de lançamentos (com parcelas e baixas) e saldos das contas
// financeiras. Banco em memória corta toda resposta em `max_rows`.
const ref = vi.hoisted(() => ({ banco: null as BancoMemoria | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ref.banco!.cliente }));

const banco = criarBancoMemoria();
ref.banco = banco;
const { listarLancamentos, listarContasFinanceirasComSaldos } = await import("./financeiro-gerencial");

const U = "u1";
const OUTRA = "u2";
const pad = (n: number) => String(n).padStart(5, "0");

function lancamento(id: string, extra: Linha = {}): Linha {
  return {
    id,
    unidade_id: U,
    tipo: "despesa",
    categoria_id: "cat",
    descricao: id,
    data_competencia: "2026-09-01",
    conta_financeira_id: null,
    observacao: "",
    origem: "manual",
    recorrencia_id: null,
    criado_por: "user1",
    criado_em: "",
    ...extra,
  };
}

function parcela(id: string, lancamentoId: string, extra: Linha = {}): Linha {
  return {
    id,
    unidade_id: U,
    lancamento_id: lancamentoId,
    numero: 1,
    total_parcelas: 1,
    valor: 10,
    data_prevista: "2026-09-10",
    conta_financeira_id: null,
    status: "aberto",
    ...extra,
  };
}

function baixa(id: string, parcelaId: string, extra: Linha = {}): Linha {
  return { id, unidade_id: U, parcela_id: parcelaId, conta_financeira_id: "conta1", valor: 1, tipo: "baixa", data: "2026-09-10", ...extra };
}

beforeEach(() => {
  banco.limpar();
  banco.tabelas.fin_lancamentos = [];
  banco.tabelas.fin_parcelas = [];
  banco.tabelas.fin_baixas = [];
  banco.tabelas.fin_categorias = [{ id: "cat", nome: "Aluguel" }];
  banco.tabelas.perfis = [{ id: "user1", nome: "Vinícius" }];
  banco.tabelas.fin_contas_financeiras = [
    { id: "conta1", unidade_id: U, nome: "Banco", tipo: "banco", saldo_inicial: 100, data_saldo_inicial: "2026-01-01", ativo: true },
  ];
});

describe("listarLancamentos - leitura completa", () => {
  it.each([999, 1000, 1001, 2000])("lê %i lançamentos inteiros, cada um com sua parcela", async (total) => {
    for (let i = 0; i < total; i++) {
      banco.tabelas.fin_lancamentos.push(lancamento(`l${pad(i)}`));
      banco.tabelas.fin_parcelas.push(parcela(`p${pad(i)}`, `l${pad(i)}`));
    }
    const lista = await listarLancamentos(U);
    expect(lista).toHaveLength(total);
    expect(new Set(lista.map((l) => l.id)).size).toBe(total);
    expect(lista.every((l) => l.parcelas.length === 1)).toBe(true);
  });

  it("mantém a ordem por competência (mais recente primeiro) e o filtro de tipo", async () => {
    for (let i = 0; i < 1200; i++) {
      const mes = String((i % 12) + 1).padStart(2, "0");
      banco.tabelas.fin_lancamentos.push(
        lancamento(`l${pad(i)}`, { data_competencia: `2026-${mes}-01`, tipo: i % 3 === 0 ? "receita" : "despesa" }),
      );
    }
    const lista = await listarLancamentos(U, { tipo: "despesa", de: "2026-03-01", ate: "2026-10-31" });
    const esperado = banco.tabelas.fin_lancamentos.filter(
      (l) => l.tipo === "despesa" && String(l.data_competencia) >= "2026-03-01" && String(l.data_competencia) <= "2026-10-31",
    );
    expect(lista).toHaveLength(esperado.length);
    const datas = lista.map((l) => l.dataCompetencia);
    expect(datas).toEqual([...datas].sort().reverse());
  });

  it("teto do servidor de 500 ainda lê tudo", async () => {
    banco.maxRows = 500;
    for (let i = 0; i < 1234; i++) banco.tabelas.fin_lancamentos.push(lancamento(`l${pad(i)}`));
    expect(await listarLancamentos(U)).toHaveLength(1234);
  });

  it("muitas parcelas e baixas para poucos lançamentos: soma do baixado completa e parcelas em ordem de número", async () => {
    banco.tabelas.fin_lancamentos.push(lancamento("l1"), lancamento("l2"));
    for (let n = 1500; n >= 1; n--) {
      banco.tabelas.fin_parcelas.push(parcela(`p1-${pad(n)}`, "l1", { numero: n, total_parcelas: 1500 }));
    }
    banco.tabelas.fin_parcelas.push(parcela("p2", "l2"));
    for (let i = 0; i < 2500; i++) banco.tabelas.fin_baixas.push(baixa(`b${pad(i)}`, "p2", { valor: 0.01 }));

    const lista = await listarLancamentos(U);
    const l1 = lista.find((l) => l.id === "l1")!;
    const l2 = lista.find((l) => l.id === "l2")!;
    expect(l1.parcelas).toHaveLength(1500);
    expect(l1.parcelas.map((p) => p.numero)).toEqual(Array.from({ length: 1500 }, (_, i) => i + 1));
    expect(l2.parcelas[0].valorBaixado).toBeCloseTo(25, 6);
  });

  it("mais de 100 lançamentos: parcelas e baixas lidas em lotes de ids", async () => {
    for (let i = 0; i < 250; i++) {
      banco.tabelas.fin_lancamentos.push(lancamento(`l${pad(i)}`));
      banco.tabelas.fin_parcelas.push(parcela(`p${pad(i)}`, `l${pad(i)}`));
      banco.tabelas.fin_baixas.push(baixa(`b${pad(i)}`, `p${pad(i)}`, { valor: 4 }));
    }
    const lista = await listarLancamentos(U);
    expect(lista.every((l) => l.parcelas[0].valorBaixado === 4)).toBe(true);
    // 3 lotes de ids (100, 100, 50), cada um com a página de dados e a vazia.
    expect(banco.ranges.fin_parcelas).toHaveLength(6);
    expect(banco.ranges.fin_baixas).toHaveLength(6);
  });

  it("não traz lançamento de outra unidade", async () => {
    for (let i = 0; i < 1100; i++) banco.tabelas.fin_lancamentos.push(lancamento(`l${pad(i)}`));
    for (let i = 0; i < 700; i++) banco.tabelas.fin_lancamentos.push(lancamento(`x${pad(i)}`, { unidade_id: OUTRA }));
    const lista = await listarLancamentos(U);
    expect(lista).toHaveLength(1100);
    expect(lista.every((l) => l.id.startsWith("l"))).toBe(true);
  });

  it("erro na segunda página lança erro, nunca devolve lista parcial", async () => {
    for (let i = 0; i < 1500; i++) banco.tabelas.fin_lancamentos.push(lancamento(`l${pad(i)}`));
    banco.falharNaLeitura.fin_lancamentos = 2;
    await expect(listarLancamentos(U)).rejects.toThrow();
  });

  it("erro na leitura das baixas também lança erro", async () => {
    banco.tabelas.fin_lancamentos.push(lancamento("l1"));
    banco.tabelas.fin_parcelas.push(parcela("p1", "l1"));
    banco.falharNaLeitura.fin_baixas = 1;
    await expect(listarLancamentos(U)).rejects.toThrow();
  });
});

describe("listarContasFinanceirasComSaldos - leitura completa", () => {
  it("saldo atual soma todas as baixas da unidade, mesmo acima de 1.000 (e com teto de 500)", async () => {
    banco.maxRows = 500;
    banco.tabelas.fin_lancamentos.push(lancamento("lr", { tipo: "receita" }), lancamento("lx", { tipo: "receita", unidade_id: OUTRA }));
    banco.tabelas.fin_parcelas.push(parcela("pr", "lr", { status: "pago" }), parcela("px", "lx", { status: "pago", unidade_id: OUTRA }));
    for (let i = 0; i < 2001; i++) banco.tabelas.fin_baixas.push(baixa(`b${pad(i)}`, "pr"));
    // Baixas de outra unidade na mesma conta não entram.
    for (let i = 0; i < 300; i++) banco.tabelas.fin_baixas.push(baixa(`x${pad(i)}`, "px", { unidade_id: OUTRA }));

    const [conta] = await listarContasFinanceirasComSaldos(U);
    expect(conta.saldoAtual).toBe(100 + 2001);
    expect(conta.saldoProjetado).toBe(100 + 2001);
  });

  it("saldo projetado usa todas as parcelas abertas e todas as baixas delas (lotes de ids)", async () => {
    banco.tabelas.fin_lancamentos.push(lancamento("ld", { tipo: "despesa" }));
    for (let i = 0; i < 1001; i++) {
      banco.tabelas.fin_parcelas.push(parcela(`p${pad(i)}`, "ld", { conta_financeira_id: "conta1", valor: 10 }));
    }
    // Parcela sem conta prevista nunca entra na projeção.
    banco.tabelas.fin_parcelas.push(parcela("sem-conta", "ld", { valor: 999 }));
    // Uma parcela aberta com muitas baixas parciais.
    for (let i = 0; i < 1500; i++) {
      banco.tabelas.fin_baixas.push(baixa(`b${pad(i)}`, "p00000", { valor: 0.004, conta_financeira_id: "conta1" }));
    }

    const [conta] = await listarContasFinanceirasComSaldos(U);
    const baixadoNaP0 = 1500 * 0.004; // 6
    expect(conta.saldoAtual).toBeCloseTo(100 - baixadoNaP0, 6);
    expect(conta.saldoProjetado).toBeCloseTo(100 - baixadoNaP0 - (1000 * 10 + (10 - baixadoNaP0)), 6);
  });

  it("erro na segunda página das baixas lança erro, nunca devolve saldo parcial", async () => {
    banco.tabelas.fin_lancamentos.push(lancamento("lr", { tipo: "receita" }));
    banco.tabelas.fin_parcelas.push(parcela("pr", "lr", { status: "pago" }));
    for (let i = 0; i < 1500; i++) banco.tabelas.fin_baixas.push(baixa(`b${pad(i)}`, "pr"));
    banco.falharNaLeitura.fin_baixas = 2;
    await expect(listarContasFinanceirasComSaldos(U)).rejects.toThrow();
  });
});
