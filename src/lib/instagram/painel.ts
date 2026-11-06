import { dataHoraBr, dataIsoBrasil } from "@/lib/operacao/quadro";
import type { Automacao, DiaMetricas, FormatoMetricas, NumerosPerfil, PecaSemana, Periodo } from "@/lib/instagram/tipos";

/** Funções puras do painel do Instagram: formatar, comparar e recortar.
 * Rodam no servidor e no navegador. `null` vira "sem dado", nunca 0. */

export const SEM_DADO = "sem dado";

export function numeroBr(v: number | null, casas = 0): string {
  if (v == null) return SEM_DADO;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function percentualBr(v: number | null): string {
  return v == null ? SEM_DADO : `${numeroBr(v, 1)}%`;
}

/** Mediana em segundos -> "45 s" ou "3 min". */
export function tempoResposta(seg: number | null): string {
  if (seg == null) return SEM_DADO;
  if (seg < 60) return `${Math.max(0, Math.round(seg))} s`;
  return `${Math.round(seg / 60)} min`;
}

export type Variacao = { texto: string; sobe: boolean } | null;

/** Contra o período anterior. Percentual para contagens; pontos percentuais
 * (p.p.) para o engajamento, que já é percentual. Sem anterior, sem variação. */
export function variacao(atual: number | null, anterior: number | null | undefined, emPontos = false): Variacao {
  if (atual == null || anterior == null) return null;
  if (emPontos) {
    const d = atual - anterior;
    return { texto: `${d >= 0 ? "+" : ""}${numeroBr(d, 1)} p.p.`, sobe: d >= 0 };
  }
  if (anterior === 0) return null;
  const p = ((atual - anterior) / anterior) * 100;
  return { texto: `${p >= 0 ? "+" : ""}${numeroBr(p, 0)}%`, sobe: p >= 0 };
}

/** Selo da automação: pausa da Meta vence "Ligada". */
export function seloAutomacao(a: Pick<Automacao, "ligada" | "pausadaAte">, agoraMs: number): { texto: string; tom: "bom" | "atencao" | "critico" } {
  if (!a.ligada) return { texto: "Desligada", tom: "critico" };
  if (a.pausadaAte != null && a.pausadaAte > agoraMs) return { texto: `Pausada até ${dataHoraBr(a.pausadaAte).slice(0, 16)}`, tom: "atencao" };
  return { texto: "Ligada", tom: "bom" };
}

function somarDias(diaIso: string, dias: number): string {
  const d = new Date(Date.UTC(+diaIso.slice(0, 4), +diaIso.slice(5, 7) - 1, +diaIso.slice(8, 10) + dias));
  return d.toISOString().slice(0, 10);
}

/** A contagem por hora só vale de `registroDesde` em diante: avisa quando começou ontem ou depois. */
export function notaRegistro(registroDesde: string | null, hoje: string): string | null {
  if (!registroDesde || registroDesde <= somarDias(hoje, -1)) return null;
  return `A contagem por hora começou em ${registroDesde.slice(8, 10)}/${registroDesde.slice(5, 7)}.`;
}

/** "09:41" se foi hoje; "04/11 09:41" se foi antes. */
export function horaEnvio(em: number | null, hoje: string): string {
  if (em == null) return SEM_DADO;
  const completo = dataHoraBr(em);
  return dataIsoBrasil(em) === hoje ? completo.slice(11) : `${completo.slice(0, 5)} ${completo.slice(11)}`;
}

/** Os últimos N dias da série diária (o Vini manda do mais antigo ao mais novo). */
export function diasDoPeriodo(porDia: DiaMetricas[], periodo: Periodo): DiaMetricas[] {
  return porDia.slice(-Number(periodo));
}

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function diaSemana(diaIso: string): string {
  return SEMANA[new Date(Date.UTC(+diaIso.slice(0, 4), +diaIso.slice(5, 7) - 1, +diaIso.slice(8, 10))).getUTCDay()];
}

export function diaMes(diaIso: string): string {
  return `${diaIso.slice(8, 10)}/${diaIso.slice(5, 7)}`;
}

/** Formato com mais salvamentos por post (só entre os que têm o número). */
export function formatoQueMaisSalva(formatos: FormatoMetricas[]): FormatoMetricas | null {
  return formatos
    .filter((f) => f.salvamentosPorPost != null && f.posts > 0)
    .sort((a, b) => (b.salvamentosPorPost ?? 0) - (a.salvamentosPorPost ?? 0))[0] ?? null;
}

/** Média simples dos perfis que têm o número; null se nenhum tem. */
export function mediaPerfis(perfis: NumerosPerfil[], campo: keyof NumerosPerfil): number | null {
  const v = perfis.map((p) => p[campo]).filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Intervalo de "O que postar essa semana": hoje e os 6 dias seguintes. */
export function intervaloSemana(hoje: string): { inicio: string; fim: string } {
  return { inicio: hoje, fim: somarDias(hoje, 6) };
}

export function ordenarPecas(pecas: PecaSemana[]): PecaSemana[] {
  return [...pecas].sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? "99").localeCompare(b.hora ?? "99"));
}
