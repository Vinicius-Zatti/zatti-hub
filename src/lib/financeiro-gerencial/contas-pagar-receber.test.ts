import { describe, expect, it } from "vitest";
import type { Titulo } from "@/lib/banco/financeiro-documentos";
import {
  agruparTitulos,
  calcularEnvelhecimento,
  classificarAba,
  diasEntre,
  faixaEnvelhecimento,
  filtrarGrupos,
  formatarValorCsv,
  gerarCsvTitulos,
  resumirAbas,
  rotuloSituacao,
  SEM_CONTRAPARTE,
} from "./contas-pagar-receber";

function titulo(p: Partial<Titulo> & { parcelaId: string }): Titulo {
  return {
    lancamentoId: `l-${p.parcelaId}`,
    tipo: "despesa",
    descricao: "Compra",
    categoriaId: "cat-1",
    categoriaNome: "Mercadorias",
    contraparteId: null,
    contraparteNome: null,
    documentoId: null,
    documentoNumero: null,
    documentoDescricao: null,
    vencimentoDocumento: null,
    numero: 1,
    totalParcelas: 1,
    dataPrevista: "2026-10-11",
    dataCompetencia: "2026-10-01",
    contaFinanceiraId: null,
    valor: 100,
    valorBaixado: 0,
    saldo: 100,
    status: "aberto",
    ...p,
  };
}

const HOJE = "2026-10-11";

describe("classificarAba", () => {
  it("separa vencido, hoje, a vencer e quitado", () => {
    expect(classificarAba({ dataPrevista: "2026-10-10", saldo: 5 }, HOJE)).toBe("vencidos");
    expect(classificarAba({ dataPrevista: HOJE, saldo: 5 }, HOJE)).toBe("hoje");
    expect(classificarAba({ dataPrevista: "2026-10-12", saldo: 5 }, HOJE)).toBe("a_vencer");
    expect(classificarAba({ dataPrevista: "2026-10-01", saldo: 0 }, HOJE)).toBe("quitados");
    expect(classificarAba({ dataPrevista: "2026-10-01", saldo: 3, status: "quitado" }, HOJE)).toBe("quitados");
  });

  it("parcial com saldo continua na aba aberta", () => {
    expect(classificarAba({ dataPrevista: "2026-09-01", saldo: 0.01 }, HOJE)).toBe("vencidos");
  });
});

describe("agruparTitulos", () => {
  const doc = { documentoId: "d1", documentoDescricao: "Nota Atacadão", documentoNumero: "123", contraparteId: "f1", contraparteNome: "Atacadão" };
  const titulos = [
    titulo({ parcelaId: "p1", ...doc, vencimentoDocumento: 1, valor: 60.1, saldo: 60.1, categoriaNome: "Mercadorias" }),
    titulo({ parcelaId: "p2", ...doc, vencimentoDocumento: 1, valor: 39.9, saldo: 19.9, valorBaixado: 20, categoriaId: "cat-2", categoriaNome: "Embalagens" }),
    titulo({ parcelaId: "p3", ...doc, vencimentoDocumento: 2, valor: 100, saldo: 100, dataPrevista: "2026-11-11" }),
    titulo({ parcelaId: "p4", descricao: "Luz" }),
  ];

  it("junta mesmo documento e mesmo vencimento, soma ao centavo", () => {
    const grupos = agruparTitulos(titulos);
    expect(grupos).toHaveLength(3);
    const g = grupos[0];
    expect(g.documentoId).toBe("d1");
    expect(g.vencimentoDocumento).toBe(1);
    expect(g.parcelaId).toBeNull();
    expect(g.descricao).toBe("Nota Atacadão");
    expect(g.categorias.map((c) => c.nome)).toEqual(["Mercadorias", "Embalagens"]);
    expect(g.valor).toBe(100);
    expect(g.valorBaixado).toBe(20);
    expect(g.saldo).toBe(80);
  });

  it("título simples vira grupo com parcelaId", () => {
    const simples = agruparTitulos(titulos)[2];
    expect(simples.parcelaId).toBe("p4");
    expect(simples.documentoId).toBeNull();
    expect(simples.descricao).toBe("Luz");
  });

  it("resume abas: aberto soma saldo, quitado soma baixado", () => {
    const grupos = agruparTitulos([
      ...titulos,
      titulo({ parcelaId: "p5", dataPrevista: "2026-10-01", valor: 50, valorBaixado: 50, saldo: 0, status: "quitado" }),
      titulo({ parcelaId: "p6", dataPrevista: "2026-10-05", valor: 10.1, saldo: 10.1 }),
      titulo({ parcelaId: "p7", dataPrevista: "2026-10-06", valor: 20.2, saldo: 20.2 }),
    ]);
    const resumo = resumirAbas(grupos, HOJE);
    expect(resumo.hoje).toEqual({ quantidade: 2, total: 180 });
    expect(resumo.a_vencer).toEqual({ quantidade: 1, total: 100 });
    expect(resumo.quitados).toEqual({ quantidade: 1, total: 50 });
    expect(resumo.vencidos).toEqual({ quantidade: 2, total: 30.3 });
  });

  it("filtra por período, contraparte, Plano de Contas e texto", () => {
    const grupos = agruparTitulos(titulos);
    expect(filtrarGrupos(grupos, { vencimentoDe: "2026-11-01" })).toHaveLength(1);
    expect(filtrarGrupos(grupos, { contraparteId: "f1" })).toHaveLength(2);
    expect(filtrarGrupos(grupos, { contraparteId: SEM_CONTRAPARTE })).toHaveLength(1);
    expect(filtrarGrupos(grupos, { categoriaId: "cat-2" })).toHaveLength(1);
    expect(filtrarGrupos(grupos, { busca: "embala" })).toHaveLength(1);
    expect(filtrarGrupos(grupos, { busca: "123" })).toHaveLength(2);
  });

  it("situação mostra parcial e pago/recebido", () => {
    const grupos = agruparTitulos(titulos);
    expect(rotuloSituacao(grupos[0], HOJE, "despesa")).toBe("Vence hoje (parcial)");
    const quitado = agruparTitulos([titulo({ parcelaId: "x", saldo: 0, valorBaixado: 100 })])[0];
    expect(rotuloSituacao(quitado, HOJE, "receita")).toBe("Recebido");
    expect(rotuloSituacao(quitado, HOJE, "despesa")).toBe("Pago");
  });
});

describe("envelhecimento", () => {
  it("conta dias sem fuso e acha a faixa", () => {
    expect(diasEntre("2026-09-30", "2026-10-01")).toBe(1);
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1);
    expect(faixaEnvelhecimento(0)).toBeNull();
    expect(faixaEnvelhecimento(1)).toBe(0);
    expect(faixaEnvelhecimento(30)).toBe(0);
    expect(faixaEnvelhecimento(31)).toBe(1);
    expect(faixaEnvelhecimento(60)).toBe(1);
    expect(faixaEnvelhecimento(61)).toBe(2);
    expect(faixaEnvelhecimento(90)).toBe(2);
    expect(faixaEnvelhecimento(91)).toBe(3);
  });

  it("soma saldo vencido por contraparte e faixa", () => {
    const grupos = agruparTitulos([
      titulo({ parcelaId: "a", contraparteId: "f1", contraparteNome: "Atacadão", dataPrevista: "2026-10-01", saldo: 10.1 }),
      titulo({ parcelaId: "b", contraparteId: "f1", contraparteNome: "Atacadão", dataPrevista: "2026-08-01", saldo: 20.2 }),
      titulo({ parcelaId: "c", contraparteId: "f2", contraparteNome: "Bebidas", dataPrevista: "2026-01-01", saldo: 100 }),
      titulo({ parcelaId: "d", dataPrevista: "2026-09-20", saldo: 5 }),
      titulo({ parcelaId: "e", dataPrevista: HOJE, saldo: 999 }),
      titulo({ parcelaId: "f", dataPrevista: "2026-01-01", saldo: 0, status: "quitado" }),
    ]);
    const r = calcularEnvelhecimento(grupos, HOJE);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Bebidas", "Atacadão", "Sem fornecedor/cliente"]);
    expect(r.linhas[1].faixas).toEqual([10.1, 0, 20.2, 0]);
    expect(r.linhas[1].total).toBe(30.3);
    expect(r.totais).toEqual([15.1, 0, 20.2, 100]);
    expect(r.total).toBe(135.3);
  });
});

describe("CSV", () => {
  it("formata valor com vírgula e sem milhar", () => {
    expect(formatarValorCsv(1234.56)).toBe("1234,56");
    expect(formatarValorCsv(0.1 + 0.2)).toBe("0,30");
    expect(formatarValorCsv(-5)).toBe("-5,00");
  });

  it("gera BOM, separador ; e escapa texto", () => {
    const grupos = agruparTitulos([
      titulo({ parcelaId: "a", descricao: 'Nota "A"; balcão', contraparteNome: "Atacadão", valor: 1234.5, saldo: 1234.5, dataPrevista: "2026-10-01" }),
    ]);
    const csv = gerarCsvTitulos(grupos, "despesa", HOJE);
    expect(csv.startsWith("﻿Vencimento;Fornecedor;Descrição")).toBe(true);
    const linha = csv.split("\r\n")[1];
    expect(linha).toBe('01/10/2026;Atacadão;"Nota ""A""; balcão";;Mercadorias;1234,50;0,00;1234,50;Vencido');
  });
});
