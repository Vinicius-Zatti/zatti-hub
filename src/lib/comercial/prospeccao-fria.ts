/** Painel da prospecção fria (Escritório > Comercial > Prospecção fria, 16/11/2026).
 * Funções puras, usadas no servidor e testadas sem banco. Só usa as etapas que
 * o CRM já tem: Abordado, Respondeu, Reunião de diagnóstico, Consultoria
 * fechada (ou "Virou cliente") e Perdido.
 *
 * Funil acumulado ("chegou até"): cada loja conta em todas as etapas até a mais
 * avançada que já alcançou na linha do tempo, mesmo que hoje esteja em Perdido
 * ou tenha voltado de etapa. O período é a data em que a loja foi contatada
 * (primeira vez que chegou em Abordado ou depois), no horário de Brasília. */

import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { ordemEtapa, type Etapa, type Lead } from "./funil";

export const PERIODOS_PROSPECCAO = ["hoje", "7", "30"] as const;
export type PeriodoProspeccao = (typeof PERIODOS_PROSPECCAO)[number];
export const ROTULO_PERIODO_PROSPECCAO: Record<PeriodoProspeccao, string> = {
  hoje: "Hoje",
  "7": "Últimos 7 dias",
  "30": "Últimos 30 dias",
};

/** Sem ?periodo= (ou com valor desconhecido) o painel abre nos últimos 7 dias. */
export function lerPeriodoProspeccao(valor: string | undefined): PeriodoProspeccao {
  return (PERIODOS_PROSPECCAO as readonly string[]).includes(valor ?? "") ? (valor as PeriodoProspeccao) : "7";
}

function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Primeiro dia (AAAA-MM-DD, Brasília) do período, incluindo hoje. */
export function inicioPeriodoProspeccao(periodo: PeriodoProspeccao, hoje: string): string {
  return periodo === "hoje" ? hoje : somarDiasIso(hoje, -(Number(periodo) - 1));
}

/** Mudança de etapa registrada na linha do tempo do lead. */
export type PassoEtapa = { em: string; paraEtapa: Etapa };
export type LeadProspeccao = Lead & { passos: PassoEtapa[] };

const ORDEM_ABORDADO = ordemEtapa("abordado");

/** Data (AAAA-MM-DD, Brasília) em que a loja foi contatada: a primeira vez que
 * chegou em Abordado ou numa etapa depois dela. null = ainda não contatada. */
export function dataContato(lead: LeadProspeccao): string | null {
  const datas = lead.passos
    .filter((p) => p.paraEtapa !== "perdido" && ordemEtapa(p.paraEtapa) >= ORDEM_ABORDADO)
    .map((p) => p.em)
    .sort();
  if (datas.length) return hojeIsoBrasil(new Date(datas[0]));
  // Sem passo na linha do tempo, vale a etapa atual (lead criado já adiante).
  if (lead.etapa !== "perdido" && ordemEtapa(lead.etapa) >= ORDEM_ABORDADO) return hojeIsoBrasil(new Date(lead.criadoEm));
  // Virou cliente sem passar por Abordado: foi contatada; vale o primeiro passo da linha do tempo.
  if (lead.organizacaoId != null) return hojeIsoBrasil(new Date(lead.passos.map((p) => p.em).sort()[0] ?? lead.criadoEm));
  return null;
}

/** Ordem da etapa mais avançada que a loja já alcançou (Perdido não conta).
 * "Virou cliente" vale como Consultoria fechada, para a loja contar em todas as
 * etapas anteriores e Cliente nunca passar de Reunião. */
export function ordemMaisAvancada(lead: LeadProspeccao): number {
  const ordens = [lead.etapa, ...lead.passos.map((p) => p.paraEtapa)]
    .filter((e) => e !== "perdido")
    .map((e) => ordemEtapa(e));
  if (lead.organizacaoId != null) ordens.push(ordemEtapa("consultoria_fechada"));
  return Math.max(0, ...ordens);
}

export type EtapaPainel = "contatadas" | "responderam" | "reuniao" | "cliente";
export const ETAPAS_PAINEL: { chave: EtapaPainel; rotulo: string; etapaCrm: string; dica: string }[] = [
  {
    chave: "contatadas",
    rotulo: "Contatadas",
    etapaCrm: "Abordado",
    dica: "Lojas da prospecção fria que chegaram em Abordado (ou depois) dentro do período.",
  },
  {
    chave: "responderam",
    rotulo: "Responderam",
    etapaCrm: "Respondeu",
    dica: "Das contatadas no período, as que já chegaram em Respondeu ou numa etapa depois dela.",
  },
  {
    chave: "reuniao",
    rotulo: "Reunião",
    etapaCrm: "Reunião de diagnóstico",
    dica: "Das contatadas no período, as que já chegaram em Reunião de diagnóstico ou depois.",
  },
  {
    chave: "cliente",
    rotulo: "Cliente",
    etapaCrm: "Consultoria fechada ou Virou cliente",
    dica: "Das contatadas no período, as que chegaram em Consultoria fechada ou foram marcadas como Virou cliente.",
  },
];

export type ResumoProspeccao = {
  totais: Record<EtapaPainel, number>;
  /** Taxa de cada etapa sobre a anterior (%, uma casa); null na primeira ou sem base. */
  taxas: Record<EtapaPainel, number | null>;
  perdidas: number;
  taxaPerdidas: number | null;
  lojas: (LeadProspeccao & { contatoEm: string })[];
};

const pct = (parte: number, base: number) => (base ? Math.round((parte / base) * 1000) / 10 : null);

export function chegouEm(lead: LeadProspeccao, etapa: EtapaPainel): boolean {
  const ordem = ordemMaisAvancada(lead);
  if (etapa === "contatadas") return ordem >= ORDEM_ABORDADO;
  if (etapa === "responderam") return ordem >= ordemEtapa("respondeu");
  if (etapa === "reuniao") return ordem >= ordemEtapa("reuniao_diagnostico");
  return ordem >= ordemEtapa("consultoria_fechada");
}

/** Funil das lojas contatadas a partir de `desde` (AAAA-MM-DD, inclusive). */
export function resumirProspeccao(leads: LeadProspeccao[], desde: string): ResumoProspeccao {
  const lojas = leads
    .map((l) => ({ ...l, contatoEm: dataContato(l) }))
    .filter((l): l is LeadProspeccao & { contatoEm: string } => l.contatoEm != null && l.contatoEm >= desde)
    .sort((a, b) => b.contatoEm.localeCompare(a.contatoEm) || a.nome.localeCompare(b.nome, "pt-BR"));
  const totais = Object.fromEntries(
    ETAPAS_PAINEL.map(({ chave }) => [chave, lojas.filter((l) => chegouEm(l, chave)).length]),
  ) as Record<EtapaPainel, number>;
  const taxas = Object.fromEntries(
    ETAPAS_PAINEL.map(({ chave }, i) => [chave, i === 0 ? null : pct(totais[chave], totais[ETAPAS_PAINEL[i - 1].chave])]),
  ) as Record<EtapaPainel, number | null>;
  const perdidas = lojas.filter((l) => l.etapa === "perdido").length;
  return { totais, taxas, perdidas, taxaPerdidas: pct(perdidas, totais.contatadas), lojas };
}
