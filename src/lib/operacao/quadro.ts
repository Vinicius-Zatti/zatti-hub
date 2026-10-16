import {
  COLUNAS,
  ESTADOS_TAREFA,
  ROTULO_TIPO,
  type Coluna,
  type EstadoTarefa,
  type ItemOperacao,
  type LadoTarefa,
  type TarefaCliente,
  type TipoItem,
} from "@/lib/operacao/tipos";

/** Funções puras do painel de operação: agrupar, filtrar, contar e datas.
 * Rodam no servidor e no navegador (sem server-only, sem Date no fuso local). */

const FUSO = "America/Sao_Paulo";

/** Dia (AAAA-MM-DD) de um instante em ms, no fuso de Brasília. */
export function dataIsoBrasil(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** "16/10/2026 14:05" no fuso de Brasília. */
export function dataHoraBr(ms: number | null): string {
  if (ms == null) return "";
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

/** AAAA-MM-DD -> DD/MM/AAAA, sem passar por Date. */
export function diaBr(diaIso: string | null): string {
  if (!diaIso) return "";
  const [a, m, d] = diaIso.split("-");
  return `${d}/${m}/${a}`;
}

function diaUtc(diaIso: string): number {
  return Date.UTC(+diaIso.slice(0, 4), +diaIso.slice(5, 7) - 1, +diaIso.slice(8, 10));
}

/** Dias inteiros entre o dia em que o cartão entrou na coluna e hoje (Brasília). */
export function diasParado(desdeEm: number | null, hojeIso: string): number | null {
  if (desdeEm == null) return null;
  return Math.max(0, Math.round((diaUtc(hojeIso) - diaUtc(dataIsoBrasil(desdeEm))) / 86_400_000));
}

export function textoDiasParado(dias: number | null): string {
  if (dias == null) return "Sem data de entrada";
  if (dias === 0) return "Entrou na coluna hoje";
  return `${dias} dia${dias === 1 ? "" : "s"} parado`;
}

export function agruparPorColuna(itens: ItemOperacao[]): { coluna: Coluna; itens: ItemOperacao[] }[] {
  // Mais antigo parado primeiro: o que espera há mais tempo fica no topo.
  const ordenar = (a: ItemOperacao, b: ItemOperacao) => (a.desdeEm ?? Infinity) - (b.desdeEm ?? Infinity);
  return COLUNAS.map((coluna) => ({ coluna, itens: itens.filter((i) => i.coluna === coluna).sort(ordenar) }));
}

export function agruparTarefasPorEstado(tarefas: TarefaCliente[]): { estado: EstadoTarefa; tarefas: TarefaCliente[] }[] {
  return ESTADOS_TAREFA.map((estado) => ({ estado, tarefas: tarefas.filter((t) => t.estado === estado) }));
}

/** Chave do filtro de cliente: a sigla quando existe, senão o nome; "" = sem cliente. */
export function chaveCliente(x: { sigla: string | null; cliente: string | null }): string {
  return x.sigla ?? x.cliente ?? "";
}

export const SEM_CLIENTE = "__sem_cliente__";

export function opcoesCliente(lista: { sigla: string | null; cliente: string | null }[]): { valor: string; rotulo: string }[] {
  const mapa = new Map<string, string>();
  let temSem = false;
  for (const x of lista) {
    const chave = chaveCliente(x);
    if (!chave) {
      temSem = true;
      continue;
    }
    if (!mapa.has(chave)) mapa.set(chave, x.sigla && x.cliente ? `${x.sigla} - ${x.cliente}` : chave);
  }
  const opcoes = [...mapa].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  return temSem ? [...opcoes, { valor: SEM_CLIENTE, rotulo: "Sem cliente" }] : opcoes;
}

function casaCliente(x: { sigla: string | null; cliente: string | null }, filtro: string): boolean {
  if (!filtro) return true;
  const chave = chaveCliente(x);
  return filtro === SEM_CLIENTE ? chave === "" : chave === filtro;
}

export type FiltroQuadro = { tipo: TipoItem | ""; cliente: string };

export function filtrarItens(itens: ItemOperacao[], filtro: FiltroQuadro): ItemOperacao[] {
  return itens.filter((i) => (!filtro.tipo || i.tipo === filtro.tipo) && casaCliente(i, filtro.cliente));
}

export type FiltroTarefas = { cliente: string; lado: LadoTarefa | "" };

export function filtrarTarefas(tarefas: TarefaCliente[], filtro: FiltroTarefas): TarefaCliente[] {
  return tarefas.filter((t) => (!filtro.lado || t.lado === filtro.lado) && casaCliente(t, filtro.cliente));
}

export const DIAS_PARADO_ALERTA = 3;

export function indicadoresQuadro(itens: ItemOperacao[], hojeIso: string) {
  const abertos = itens.filter((i) => i.coluna !== "resolvida");
  return {
    abertos: abertos.length,
    esperandoVoce: abertos.filter((i) => i.coluna === "esperando_voce").length,
    paradas: abertos.filter((i) => (diasParado(i.desdeEm, hojeIso) ?? 0) >= DIAS_PARADO_ALERTA).length,
  };
}

/** Selo do cartão: o tipo e, no alerta, o subtipo ("Alerta: orçamento"). */
export function rotuloSelo(item: Pick<ItemOperacao, "tipo" | "subtipo">): string {
  return item.tipo === "alerta" && item.subtipo ? `${ROTULO_TIPO.alerta}: ${item.subtipo}` : ROTULO_TIPO[item.tipo];
}

// ── Prazo das tarefas ──────────────────────────────────────────────────────

function diaValido(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Prazo em texto -> AAAA-MM-DD, só quando é uma data reconhecível: "20/10",
 * "20/10/2026", "20/10/26", "2026-10-20" (aceita "até" na frente). Texto livre
 * ("semana que vem", "depois da reunião") devolve null e nunca vira vencido.
 * Sem ano, vale o ano da reunião (ou de hoje); se cair mais de 6 meses antes
 * dela, é o ano seguinte (reunião em dezembro com prazo 05/01). */
export function prazoComoData(prazo: string, referenciaIso: string): string | null {
  const t = prazo.trim().toLowerCase().replace(/^(at[eé]|prazo:?)\s+/, "").replace(/\.$/, "");
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return diaValido(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (!m) return null;
  const dia = +m[1];
  const mes = +m[2];
  const refAno = +referenciaIso.slice(0, 4);
  let ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : refAno;
  if (!diaValido(ano, mes, dia)) return null;
  let iso = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  // Só vira o ano quando a data cai bem antes da referência (mais de 6 meses):
  // prazo 05/01 numa reunião de dezembro. Prazo 01/10 numa reunião de 10/10 fica no mesmo ano.
  if (!m[3] && diaUtc(referenciaIso) - diaUtc(iso) > 183 * 86_400_000) {
    ano += 1;
    if (!diaValido(ano, mes, dia)) return null;
    iso = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  }
  return iso;
}

/** Vencida = não está feita e o prazo é uma data reconhecível anterior a hoje. */
export function tarefaVencida(t: Pick<TarefaCliente, "prazo" | "estado" | "reuniaoEm">, hojeIso: string): boolean {
  if (t.estado === "feito") return false;
  const data = prazoComoData(t.prazo, t.reuniaoEm ?? hojeIso);
  return data != null && data < hojeIso;
}

export function indicadoresTarefas(tarefas: TarefaCliente[], hojeIso: string) {
  return {
    abertas: tarefas.filter((t) => t.estado !== "feito").length,
    vencidas: tarefas.filter((t) => tarefaVencida(t, hojeIso)).length,
  };
}
