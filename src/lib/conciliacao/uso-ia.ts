// Agregação semanal do custo de IA (segunda a domingo, horário de Brasília),
// mesma regra da RPC `fin_conciliacao_resumo_semanal_ia` usada pelo Vini.

export type ChamadaParaSemana = { custoUsd: number | null; situacao: string; iniciadaEm: string };
export type Semana = { inicio: string; fim: string; custoUsd: number; chamadas: number; semCustoConhecido: number };

function diaBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function somarDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Segunda-feira da semana de uma data AAAA-MM-DD. */
export function segundaDaSemana(dataIso: string): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return somarDias(dataIso, -((diaSemana + 6) % 7));
}

export function agruparPorSemana(chamadas: ChamadaParaSemana[], hojeIso: string, semanas: number): Semana[] {
  const atual = segundaDaSemana(hojeIso);
  const lista: Semana[] = [];
  for (let i = 0; i < semanas; i++) {
    const inicio = somarDias(atual, -7 * i);
    lista.push({ inicio, fim: somarDias(inicio, 6), custoUsd: 0, chamadas: 0, semCustoConhecido: 0 });
  }
  const porInicio = new Map(lista.map((s) => [s.inicio, s]));
  for (const c of chamadas) {
    const semana = porInicio.get(segundaDaSemana(diaBrasilia(c.iniciadaEm)));
    if (!semana) continue;
    semana.chamadas += 1;
    if (c.custoUsd === null || c.situacao === "iniciada" || c.situacao === "consumo_desconhecido") semana.semCustoConhecido += 1;
    else semana.custoUsd = Math.round((semana.custoUsd + c.custoUsd) * 1_000_000) / 1_000_000;
  }
  return lista;
}
