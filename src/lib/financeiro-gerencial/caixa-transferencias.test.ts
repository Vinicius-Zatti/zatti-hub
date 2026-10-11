import { describe, expect, it } from "vitest";
import { CATEGORIA_TRANSFERENCIA, montarMovimentosCaixa } from "./caixa";
import type { ContaFinanceira, TransferenciaBase } from "./tipos";

const contas: ContaFinanceira[] = [
  { id: "a", nome: "Banco A", tipo: "banco", saldoInicial: 0, dataSaldoInicial: "2026-01-01", ativo: true },
  { id: "b", nome: "Banco B", tipo: "banco", saldoInicial: 0, dataSaldoInicial: "2026-01-01", ativo: true },
];
const transferencias: TransferenciaBase[] = [{ id: "t1", contaOrigemId: "a", contaDestinoId: "b", valor: 1000, data: "2026-10-06" }];

describe("transferências no caixa (Financeiro V2)", () => {
  it("todas as contas: transferência não aparece (se anula)", () => {
    expect(montarMovimentosCaixa({ visao: "realizado", lancamentos: [], baixas: [], contas, transferencias })).toEqual([]);
  });
  it("conta de origem vê saída e a de destino vê entrada", () => {
    const origem = montarMovimentosCaixa({ visao: "realizado", lancamentos: [], baixas: [], contas, transferencias, contaFinanceiraId: "a" });
    const destino = montarMovimentosCaixa({ visao: "projetado", lancamentos: [], baixas: [], contas, transferencias, contaFinanceiraId: "b" });
    expect(origem).toEqual([expect.objectContaining({ valor: -1000, tipo: "despesa", categoriaId: CATEGORIA_TRANSFERENCIA })]);
    expect(destino).toEqual([expect.objectContaining({ valor: 1000, tipo: "receita", categoriaId: CATEGORIA_TRANSFERENCIA })]);
  });
});
