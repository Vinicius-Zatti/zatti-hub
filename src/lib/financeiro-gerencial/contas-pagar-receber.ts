/** Contas a pagar e a receber (Financeiro V2, 11/10/2026): funções puras usadas pela tela
 * `/financeiro-gerencial/contas-pagar-receber`. Tudo que soma dinheiro trabalha em centavos
 * inteiros e só volta para reais no fim, para o total da aba bater com a soma das linhas.
 *
 * Título = uma parcela (`fin_parcelas`). Nota com vários Plano de Contas gera uma parcela por
 * linha em cada vencimento; aqui elas voltam a ser uma linha só (mesmo documento + mesmo
 * vencimento), que é como a pessoa enxerga a nota do fornecedor. */

import type { Titulo } from "@/lib/banco/financeiro-documentos";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { TipoLancamento } from "@/lib/financeiro-gerencial/tipos";

export type AbaTitulo = "vencidos" | "hoje" | "a_vencer" | "quitados";

export const ABAS_TITULO: readonly AbaTitulo[] = ["vencidos", "hoje", "a_vencer", "quitados"];

export type GrupoTitulo = {
  chave: string;
  /** Preenchido quando o grupo é de documento (baixa via `baixarVencimentoDocumentoAction`). */
  documentoId: string | null;
  vencimentoDocumento: number | null;
  /** Parcela única (baixa via `registrarBaixaAction`) quando não é documento. */
  parcelaId: string | null;
  titulos: Titulo[];
  dataPrevista: string;
  contraparteId: string | null;
  contraparteNome: string | null;
  descricao: string;
  documentoNumero: string | null;
  numero: number;
  totalParcelas: number;
  categorias: { id: string; nome: string; valor: number }[];
  valor: number;
  valorBaixado: number;
  saldo: number;
};

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

/** Agrupa as parcelas do mesmo documento e do mesmo vencimento numa linha só. Parcela sem
 * documento continua sozinha. A ordem segue a primeira aparição (a lista já vem por data). */
export function agruparTitulos(titulos: Titulo[]): GrupoTitulo[] {
  const grupos = new Map<string, Titulo[]>();
  for (const t of titulos) {
    const chave =
      t.documentoId && t.vencimentoDocumento !== null ? `doc:${t.documentoId}:${t.vencimentoDocumento}` : `parcela:${t.parcelaId}`;
    const lista = grupos.get(chave);
    if (lista) lista.push(t);
    else grupos.set(chave, [t]);
  }
  return [...grupos.entries()].map(([chave, lista]) => {
    const primeiro = lista[0];
    const ehDocumento = chave.startsWith("doc:");
    const valorC = lista.reduce((a, t) => a + centavos(t.valor), 0);
    const baixadoC = lista.reduce((a, t) => a + centavos(t.valorBaixado), 0);
    const saldoC = lista.reduce((a, t) => a + centavos(t.saldo), 0);
    return {
      chave,
      documentoId: ehDocumento ? primeiro.documentoId : null,
      vencimentoDocumento: ehDocumento ? primeiro.vencimentoDocumento : null,
      parcelaId: ehDocumento ? null : primeiro.parcelaId,
      titulos: lista,
      dataPrevista: lista.reduce((min, t) => (t.dataPrevista < min ? t.dataPrevista : min), primeiro.dataPrevista),
      contraparteId: primeiro.contraparteId,
      contraparteNome: primeiro.contraparteNome,
      descricao: (ehDocumento ? primeiro.documentoDescricao : null) || primeiro.descricao,
      documentoNumero: primeiro.documentoNumero,
      numero: primeiro.numero,
      totalParcelas: primeiro.totalParcelas,
      categorias: lista.map((t) => ({ id: t.categoriaId, nome: t.categoriaNome, valor: t.valor })),
      valor: reais(valorC),
      valorBaixado: reais(baixadoC),
      saldo: reais(saldoC),
    };
  });
}

/** Sem saldo (ou parcela quitada) = Pagos/Recebidos; senão pela data prevista contra hoje. */
export function classificarAba(item: { dataPrevista: string; saldo: number; status?: string }, hoje: string): AbaTitulo {
  if (item.status === "quitado" || centavos(item.saldo) <= 0) return "quitados";
  if (item.dataPrevista < hoje) return "vencidos";
  if (item.dataPrevista === hoje) return "hoje";
  return "a_vencer";
}

export type ResumoAba = { quantidade: number; total: number };

/** Total de cada aba: nas abertas soma o saldo; em Pagos/Recebidos soma o que foi baixado. */
export function resumirAbas(grupos: GrupoTitulo[], hoje: string): Record<AbaTitulo, ResumoAba> {
  const acumulado: Record<AbaTitulo, { quantidade: number; centavos: number }> = {
    vencidos: { quantidade: 0, centavos: 0 },
    hoje: { quantidade: 0, centavos: 0 },
    a_vencer: { quantidade: 0, centavos: 0 },
    quitados: { quantidade: 0, centavos: 0 },
  };
  for (const g of grupos) {
    const aba = classificarAba(g, hoje);
    acumulado[aba].quantidade++;
    acumulado[aba].centavos += centavos(aba === "quitados" ? g.valorBaixado : g.saldo);
  }
  const saida = {} as Record<AbaTitulo, ResumoAba>;
  for (const aba of ABAS_TITULO) saida[aba] = { quantidade: acumulado[aba].quantidade, total: reais(acumulado[aba].centavos) };
  return saida;
}

export type FiltroTitulos = {
  vencimentoDe?: string;
  vencimentoAte?: string;
  contraparteId?: string;
  categoriaId?: string;
  busca?: string;
};

/** "sem" no filtro de fornecedor/cliente = títulos sem contraparte. */
export const SEM_CONTRAPARTE = "sem";

export function filtrarGrupos(grupos: GrupoTitulo[], filtro: FiltroTitulos): GrupoTitulo[] {
  const termo = (filtro.busca ?? "").trim().toLowerCase();
  return grupos.filter((g) => {
    if (filtro.vencimentoDe && g.dataPrevista < filtro.vencimentoDe) return false;
    if (filtro.vencimentoAte && g.dataPrevista > filtro.vencimentoAte) return false;
    if (filtro.contraparteId) {
      if (filtro.contraparteId === SEM_CONTRAPARTE ? g.contraparteId !== null : g.contraparteId !== filtro.contraparteId) return false;
    }
    if (filtro.categoriaId && !g.categorias.some((c) => c.id === filtro.categoriaId)) return false;
    if (termo) {
      const alvo = [g.descricao, g.contraparteNome ?? "", g.documentoNumero ?? "", ...g.categorias.map((c) => c.nome)]
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

/** Dias corridos entre duas datas ISO, sem passar por fuso (UTC puro). */
export function diasEntre(deIso: string, ateIso: string): number {
  const [a1, m1, d1] = deIso.split("-").map(Number);
  const [a2, m2, d2] = ateIso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export const FAIXAS_ENVELHECIMENTO = ["1 a 30 dias", "31 a 60 dias", "61 a 90 dias", "Mais de 90 dias"] as const;

/** Índice da faixa (0 a 3) para quantos dias de atraso; null quando não está vencido. */
export function faixaEnvelhecimento(diasAtraso: number): number | null {
  if (diasAtraso < 1) return null;
  if (diasAtraso <= 30) return 0;
  if (diasAtraso <= 60) return 1;
  if (diasAtraso <= 90) return 2;
  return 3;
}

export type LinhaEnvelhecimento = { contraparteId: string | null; nome: string; faixas: number[]; total: number };

/** Saldo vencido por fornecedor/cliente em cada faixa de atraso, do maior total para o menor. */
export function calcularEnvelhecimento(
  grupos: GrupoTitulo[],
  hoje: string,
): { linhas: LinhaEnvelhecimento[]; totais: number[]; total: number } {
  const porContraparte = new Map<string, { contraparteId: string | null; nome: string; faixas: number[] }>();
  const totaisC = [0, 0, 0, 0];
  for (const g of grupos) {
    const saldoC = centavos(g.saldo);
    if (saldoC <= 0) continue;
    const faixa = faixaEnvelhecimento(diasEntre(g.dataPrevista, hoje));
    if (faixa === null) continue;
    const chave = g.contraparteId ?? SEM_CONTRAPARTE;
    let linha = porContraparte.get(chave);
    if (!linha) {
      linha = { contraparteId: g.contraparteId, nome: g.contraparteNome ?? "Sem fornecedor/cliente", faixas: [0, 0, 0, 0] };
      porContraparte.set(chave, linha);
    }
    linha.faixas[faixa] += saldoC;
    totaisC[faixa] += saldoC;
  }
  const linhas = [...porContraparte.values()]
    .map((l) => ({
      contraparteId: l.contraparteId,
      nome: l.nome,
      faixas: l.faixas.map(reais),
      total: reais(l.faixas.reduce((a, b) => a + b, 0)),
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  return { linhas, totais: totaisC.map(reais), total: reais(totaisC.reduce((a, b) => a + b, 0)) };
}

/** Rótulo da situação mostrado na tabela e no CSV. */
export function rotuloSituacao(grupo: GrupoTitulo, hoje: string, tipo: TipoLancamento): string {
  const aba = classificarAba(grupo, hoje);
  if (aba === "quitados") return tipo === "receita" ? "Recebido" : "Pago";
  const base = aba === "vencidos" ? "Vencido" : aba === "hoje" ? "Vence hoje" : "A vencer";
  return centavos(grupo.valorBaixado) > 0 ? `${base} (parcial)` : base;
}

/** 1234.5 -> "1234,50" (sem ponto de milhar, para planilha abrir como número). */
export function formatarValorCsv(valor: number): string {
  const c = centavos(valor);
  const sinal = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sinal}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function campoCsv(texto: string): string {
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV com BOM UTF-8 e separador ";" (o Excel em português abre direto). */
export function gerarCsvTitulos(grupos: GrupoTitulo[], tipo: TipoLancamento, hoje: string): string {
  const cabecalho = [
    "Vencimento",
    tipo === "receita" ? "Cliente" : "Fornecedor",
    "Descrição",
    "Número da nota",
    "Plano de Contas",
    "Valor",
    tipo === "receita" ? "Recebido" : "Pago",
    "Saldo",
    "Situação",
  ];
  const linhas = grupos.map((g) =>
    [
      formatarDataBr(g.dataPrevista),
      g.contraparteNome ?? "",
      g.descricao,
      g.documentoNumero ?? "",
      g.categorias.map((c) => c.nome).join(" | "),
      formatarValorCsv(g.valor),
      formatarValorCsv(g.valorBaixado),
      formatarValorCsv(g.saldo),
      rotuloSituacao(g, hoje, tipo),
    ]
      .map(campoCsv)
      .join(";"),
  );
  return `﻿${[cabecalho.map(campoCsv).join(";"), ...linhas].join("\r\n")}\r\n`;
}
