/** Caixa de Entrada (Financeiro V2, 11/10/2026): funções puras da tela. Transformam o que a
 * leitura (XML ou IA) devolveu nos valores iniciais do formulário da nota. A pessoa sempre
 * revisa antes de lançar. */

import type { ExtracaoDocumento, Sugestao, TipoDocumentoLido } from "@/lib/caixa-entrada/extracao";

export type ExtracaoComSugestao = ExtracaoDocumento & { sugestao: Sugestao; contraparteId: string | null };

const ROTULO_TIPO: Record<TipoDocumentoLido, string> = {
  nota_fiscal: "Nota fiscal",
  boleto: "Boleto",
  recibo: "Recibo",
  comprovante: "Comprovante",
  outro: "Documento",
};

export function rotuloTipoDocumento(tipo: TipoDocumentoLido): string {
  return ROTULO_TIPO[tipo] ?? "Documento";
}

/** "2026-10-11T15:04:00Z" -> "11/10/2026 12:04" no fuso de São Paulo. */
export function formatarDataHoraBr(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  const hora = p("hour") === "24" ? "00" : p("hour");
  return `${p("day")}/${p("month")}/${p("year")} ${hora}:${p("minute")}`;
}

/** Descrição padrão do lançamento: "Nota fiscal nº 123 - Atacadão". */
export function descricaoSugerida(e: ExtracaoDocumento): string {
  const base = e.numero ? `${rotuloTipoDocumento(e.tipoDocumento)} nº ${e.numero}` : rotuloTipoDocumento(e.tipoDocumento);
  return (e.contraparteNome ? `${base} - ${e.contraparteNome}` : base).slice(0, 200);
}

export type ValoresIniciaisDaEntrada = {
  tipo: "despesa";
  contraparteId: string | null;
  novaContraparte?: { nome: string; documento: string };
  numero: string;
  descricao: string;
  dataEmissao: string | null;
  dataCompetencia: string;
  linhas?: { categoriaId: string; descricao: string; valor: number | null }[];
  vencimentos?: { dataPrevista: string; valor: number | null }[];
};

/** Valores iniciais do formulário a partir da extração. Plano de Contas sugerido que não está
 * entre os permitidos (`idsPlanoValidos`) fica em branco para a pessoa escolher. */
export function valoresIniciaisDaExtracao(e: ExtracaoComSugestao, hoje: string, idsPlanoValidos: Set<string>): ValoresIniciaisDaEntrada {
  const linhas = e.sugestao.linhas.map((l) => ({
    categoriaId: l.planoContasCodigo && idsPlanoValidos.has(l.planoContasCodigo) ? l.planoContasCodigo : "",
    descricao: l.descricao.slice(0, 200),
    valor: l.valorCentavos > 0 ? l.valorCentavos / 100 : null,
  }));
  const vencimentos = e.sugestao.vencimentos.map((v) => ({ dataPrevista: v.data, valor: v.valorCentavos > 0 ? v.valorCentavos / 100 : null }));
  return {
    tipo: "despesa",
    contraparteId: e.contraparteId,
    novaContraparte:
      !e.contraparteId && e.contraparteNome ? { nome: e.contraparteNome.slice(0, 160), documento: e.contraparteDocumento ?? "" } : undefined,
    numero: (e.numero ?? "").slice(0, 60),
    descricao: descricaoSugerida(e),
    dataEmissao: e.dataEmissao,
    dataCompetencia: e.dataEmissao ?? hoje,
    linhas: linhas.length > 0 ? linhas : undefined,
    vencimentos: vencimentos.length > 0 ? vencimentos : undefined,
  };
}

/** Total lido: soma dos vencimentos sugeridos, ou o total impresso. */
export function totalLido(e: ExtracaoComSugestao): number {
  const venc = e.sugestao.vencimentos.reduce((a, v) => a + v.valorCentavos, 0);
  return (venc > 0 ? venc : e.valorTotalCentavos) / 100;
}
