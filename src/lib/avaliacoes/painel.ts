import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { linhaCsv } from "@/lib/csv";
import { OPCOES_CONHECEU, OPCOES_ESPERA, ROTULO_ORIGEM, rotuloOpcao, type Opcao, type Origem } from "./perguntas";

// Avaliações: números do painel da gestão e o CSV. Funções puras sobre as respostas já lidas
// (o recorte de período e de unidade vem do banco, pela RLS).

export type RespostaPainel = {
  id: string;
  criadoEm: string;
  origem: Origem;
  atendimento: number | null;
  comida: number | null;
  espera: string | null;
  nps: number | null;
  conheceu: string | null;
  conheceuOutro: string | null;
  comentario: string | null;
  notaBaixa: boolean;
  whatsapp: string | null;
  consentimentoEm: string | null;
  consentimentoVersao: number | null;
};

// ── Filtros ──────────────────────────────────────────────────────────────

export const PERIODOS = ["7", "30", "90"] as const;
export type Periodo = (typeof PERIODOS)[number];
export type FiltroOrigem = "todas" | Origem;

export function lerPeriodo(valor: string | undefined): Periodo {
  return (PERIODOS as readonly string[]).includes(valor ?? "") ? (valor as Periodo) : "30";
}

export function lerFiltroOrigem(valor: string | undefined): FiltroOrigem {
  return valor === "salao" || valor === "delivery" ? valor : "todas";
}

function somarDiasIso(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Dia inicial e final (AAAA-MM-DD, Brasília) e o instante de início para a consulta: meia-noite
 * de Brasília (UTC-3, sem horário de verão desde 2019). */
export function intervaloPeriodo(periodo: Periodo, agora: Date = new Date()): { de: string; ate: string; desdeIso: string } {
  const ate = hojeIsoBrasil(agora);
  const de = somarDiasIso(ate, -(Number(periodo) - 1));
  return { de, ate, desdeIso: `${de}T03:00:00.000Z` };
}

// ── Data e hora de Brasília ──────────────────────────────────────────────

/** "12/11/2026 20:14" no fuso de Brasília. */
export function dataHoraBr(iso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return `${formatarDataBr(`${p("year")}-${p("month")}-${p("day")}`)} ${p("hour")}:${p("minute")}`;
}

// ── Números ──────────────────────────────────────────────────────────────

/** NPS = % de quem deu 9 ou 10 (promotores) menos % de quem deu 0 a 6 (detratores), de -100 a 100. */
export function calcularNps(notas: number[]): { nps: number | null; promotores: number; neutros: number; detratores: number; total: number } {
  const total = notas.length;
  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;
  return {
    nps: total === 0 ? null : Math.round(((promotores - detratores) / total) * 100),
    promotores,
    neutros: total - promotores - detratores,
    detratores,
    total,
  };
}

/** Média com uma casa (4,3). Sem nota, nulo. */
export function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

export type ItemDistribuicao = { valor: string; rotulo: string; quantidade: number; percentual: number };

function distribuir(valores: (string | null)[], opcoes: readonly Opcao[]): ItemDistribuicao[] {
  const respondidas = valores.filter((v): v is string => v !== null);
  return opcoes.map((o) => {
    const quantidade = respondidas.filter((v) => v === o.valor).length;
    return { valor: o.valor, rotulo: o.rotulo, quantidade, percentual: respondidas.length ? Math.round((quantidade / respondidas.length) * 100) : 0 };
  });
}

export type ResumoAvaliacoes = {
  total: number;
  porOrigem: Record<Origem, number>;
  mediaAtendimento: number | null;
  respostasAtendimento: number;
  mediaComida: number | null;
  respostasComida: number;
  nps: ReturnType<typeof calcularNps>;
  notasBaixas: number;
  espera: ItemDistribuicao[];
  conheceu: ItemDistribuicao[];
  /** "Outro" escrito por quem respondeu, mais novo primeiro. */
  conheceuOutros: string[];
};

export function filtrarPorOrigem(respostas: RespostaPainel[], origem: FiltroOrigem): RespostaPainel[] {
  return origem === "todas" ? respostas : respostas.filter((r) => r.origem === origem);
}

export function resumir(respostas: RespostaPainel[]): ResumoAvaliacoes {
  const notas = (f: (r: RespostaPainel) => number | null) => respostas.flatMap((r) => (f(r) === null ? [] : [f(r) as number]));
  const atendimento = notas((r) => r.atendimento);
  const comida = notas((r) => r.comida);
  return {
    total: respostas.length,
    porOrigem: {
      salao: respostas.filter((r) => r.origem === "salao").length,
      delivery: respostas.filter((r) => r.origem === "delivery").length,
    },
    mediaAtendimento: media(atendimento),
    respostasAtendimento: atendimento.length,
    mediaComida: media(comida),
    respostasComida: comida.length,
    nps: calcularNps(notas((r) => r.nps)),
    notasBaixas: respostas.filter((r) => r.notaBaixa).length,
    espera: distribuir(respostas.map((r) => r.espera), OPCOES_ESPERA),
    conheceu: distribuir(respostas.map((r) => r.conheceu), OPCOES_CONHECEU),
    conheceuOutros: respostas.flatMap((r) => (r.conheceu === "outro" && r.conheceuOutro ? [r.conheceuOutro] : [])),
  };
}

export function textoMedia(valor: number | null): string {
  return valor === null ? "-" : valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function textoNps(valor: number | null): string {
  return valor === null ? "-" : String(valor);
}

/** Respostas com comentário, mais nova primeiro (já vêm assim do banco). */
export function comComentario(respostas: RespostaPainel[]): RespostaPainel[] {
  return respostas.filter((r) => r.comentario);
}

/** Só quem deixou o WhatsApp e marcou a autorização (sem isso o número nem existe no banco). */
export function contatosComConsentimento(respostas: RespostaPainel[]): RespostaPainel[] {
  return respostas.filter((r) => r.whatsapp && r.consentimentoEm);
}

/** "(16) 99999-0001" a partir de "5516999990001". */
export function formatarWhatsapp(digitos: string): string {
  const n = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return digitos;
}

export const DICAS = {
  total: "Quantas avaliações chegaram no período e na origem escolhidos. Cada envio da página do QR conta uma.",
  atendimento: "Média das notas de 1 a 5 da pergunta de atendimento: soma das notas dividida por quantas pessoas responderam essa pergunta.",
  comida: "Média das notas de 1 a 5 da pergunta da comida: soma das notas dividida por quantas pessoas responderam essa pergunta.",
  nps:
    "NPS (de -100 a 100): porcentagem de quem deu 9 ou 10 na pergunta \"indicaria\" menos a porcentagem de quem deu de 0 a 6. Quem deu 7 ou 8 conta no total, mas não soma nem tira.",
  notasBaixas:
    "Avaliações com atendimento ou comida até 2, ou nota de indicação até 6. São as que viram alerta no WhatsApp de quem você marcou para receber.",
  espera: "Quantas pessoas escolheram cada faixa de tempo de espera, e a porcentagem sobre quem respondeu essa pergunta.",
  conheceu: "Quantas pessoas escolheram cada forma de conhecer o restaurante, e a porcentagem sobre quem respondeu essa pergunta.",
} as const;

// ── CSV ──────────────────────────────────────────────────────────────────

/** Separador ";" (Excel em português), com BOM. `campoCsv` neutraliza fórmula. O WhatsApp só sai
 * de quem autorizou (quem não autorizou nem tem número guardado). */
export function gerarCsv(respostas: RespostaPainel[]): string {
  const cabecalho = [
    "Data e hora",
    "Origem",
    "Atendimento (1 a 5)",
    "Comida (1 a 5)",
    "Tempo de espera",
    "Indicaria (0 a 10)",
    "Como conheceu",
    "Como conheceu (outro)",
    "Comentário",
    "Nota baixa",
    "WhatsApp (autorizado)",
    "Autorizado em",
  ];
  const linhas = respostas.map((r) =>
    linhaCsv([
      dataHoraBr(r.criadoEm),
      ROTULO_ORIGEM[r.origem],
      r.atendimento === null ? "" : String(r.atendimento),
      r.comida === null ? "" : String(r.comida),
      rotuloOpcao("espera", r.espera),
      r.nps === null ? "" : String(r.nps),
      rotuloOpcao("conheceu", r.conheceu),
      r.conheceuOutro ?? "",
      (r.comentario ?? "").replace(/\r?\n/g, " "),
      r.notaBaixa ? "Sim" : "Não",
      r.whatsapp && r.consentimentoEm ? formatarWhatsapp(r.whatsapp) : "",
      r.whatsapp && r.consentimentoEm ? dataHoraBr(r.consentimentoEm) : "",
    ]),
  );
  return "﻿" + [linhaCsv(cabecalho), ...linhas].join("\r\n") + "\r\n";
}
