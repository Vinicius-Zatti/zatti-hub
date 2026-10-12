import { describe, expect, it } from "vitest";
import { contasQuePagam, formatarReferencia, referenciaFatura, situacaoFatura, totaisFatura } from "./cartao";

describe("totaisFatura", () => {
  it("soma total, pago e saldo em centavos e ignora parcela cancelada", () => {
    const r = totaisFatura([
      { valor: 0.1, pago: 0, status: "aberto" },
      { valor: 0.2, pago: 0.2, status: "quitado" },
      { valor: 100, pago: 40, status: "parcial" },
      { valor: 50, pago: 0, status: "cancelado" },
    ]);
    expect(r).toEqual({ total: 100.3, pago: 40.2, saldo: 60.1 });
  });

  it("fatura vazia tem tudo zero", () => {
    expect(totaisFatura([])).toEqual({ total: 0, pago: 0, saldo: 0 });
  });
});

describe("situacaoFatura", () => {
  const f = { fechamento: "2026-10-05", vencimento: "2026-10-15", total: 300, saldo: 300 };

  it("aberta até o dia do fechamento", () => {
    expect(situacaoFatura(f, "2026-10-01")).toBe("aberta");
    expect(situacaoFatura(f, "2026-10-05")).toBe("aberta");
  });

  it("fechada entre o fechamento e o vencimento com saldo", () => {
    expect(situacaoFatura(f, "2026-10-06")).toBe("fechada");
    expect(situacaoFatura(f, "2026-10-15")).toBe("fechada");
  });

  it("vencida depois do vencimento com saldo", () => {
    expect(situacaoFatura(f, "2026-10-16")).toBe("vencida");
  });

  it("paga com saldo zero", () => {
    expect(situacaoFatura({ ...f, saldo: 0 }, "2026-10-20")).toBe("paga");
    expect(situacaoFatura({ ...f, saldo: 0 }, "2026-10-02")).toBe("paga");
  });

  it("fatura sem compras fica aberta antes do fechamento", () => {
    expect(situacaoFatura({ ...f, total: 0, saldo: 0 }, "2026-10-02")).toBe("aberta");
  });
});

describe("referenciaFatura", () => {
  it("compra até o fechamento cai no mês; depois, no seguinte", () => {
    expect(referenciaFatura("2026-10-05", 5)).toBe("2026-10-01");
    expect(referenciaFatura("2026-10-06", 5)).toBe("2026-11-01");
  });

  it("vira o ano em dezembro", () => {
    expect(referenciaFatura("2026-12-20", 10)).toBe("2027-01-01");
  });

  it("fechamento 31 em mês curto usa o último dia", () => {
    expect(referenciaFatura("2027-02-28", 31)).toBe("2027-02-01");
  });
});

describe("formatarReferencia e contasQuePagam", () => {
  it("mostra MM/AAAA", () => {
    expect(formatarReferencia("2026-03-01")).toBe("03/2026");
  });

  it("nunca oferece cartão para pagar", () => {
    const contas = [
      { id: "a", tipo: "banco" as const },
      { id: "b", tipo: "cartao_credito" as const },
      { id: "c", tipo: "caixa" as const },
    ];
    expect(contasQuePagam(contas).map((c) => c.id)).toEqual(["a", "c"]);
  });
});
