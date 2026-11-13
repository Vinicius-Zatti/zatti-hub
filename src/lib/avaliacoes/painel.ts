import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { linhaCsv } from "@/lib/csv";
import { CHAVES_ESTRELAS, OPCOES_CONHECEU, OPCOES_ESPERA, ROTULO_ORIGEM, definicao, rotuloAtendente, rotuloOpcao, type ChavePergunta, type Opcao, type Origem } from "./perguntas";

// Avaliações: números do painel da gestão e o CSV. Funções puras sobre as respostas já lidas
// (o recorte de período e de unidade vem do banco, pela RLS).

export type RespostaPainel = {
  id: string;
  criadoEm: string;
  origem: Origem;
  atendimento: number | null;
  comida: number | null;
  tempo: number | null;
  ambiente: number | null;
  embalagem: number | null;
  entrega: number | null;
  atendimentoPedido: number | null;
  pedidoCerto: boolean | null;
  atendente: string | null;
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
  return valor === "salao" || valor === "delivery" || valor === "app" ? valor : "todas";
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

/** Nota de 1 a 5 de uma pergunta, pelo nome da chave no banco. */
export function notaDe(r: RespostaPainel, chave: ChavePergunta): number | null {
  switch (chave) {
    case "atendimento":
      return r.atendimento;
    case "comida":
      return r.comida;
    case "tempo":
      return r.tempo;
    case "ambiente":
      return r.ambiente;
    case "embalagem":
      return r.embalagem;
    case "entrega":
      return r.entrega;
    case "atendimento_pedido":
      return r.atendimentoPedido;
    default:
      return null;
  }
}

export type MediaPergunta = { chave: ChavePergunta; nome: string; media: number | null; respostas: number };
export type LinhaAtendente = { nome: string; quantidade: number; mediaAtendimento: number | null; mediaIndicaria: number | null };

export type ResumoAvaliacoes = {
  total: number;
  porOrigem: Record<Origem, number>;
  /** Médias de 1 a 5 de cada pergunta de estrelas que teve resposta (atendimento e comida sempre). */
  medias: MediaPergunta[];
  /** Delivery e apps: quantos disseram que o pedido veio certo. */
  pedidoCerto: { certos: number; total: number };
  atendentes: LinhaAtendente[];
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
  const medias: MediaPergunta[] = CHAVES_ESTRELAS.map((chave) => {
    const valores = notas((r) => notaDe(r, chave));
    return { chave, nome: definicao(chave).nome, media: media(valores), respostas: valores.length };
  }).filter((m) => m.respostas > 0 || m.chave === "atendimento" || m.chave === "comida");
  const comPedido = respostas.filter((r) => r.pedidoCerto !== null);
  const porAtendente = new Map<string, RespostaPainel[]>();
  for (const r of respostas) {
    if (!r.atendente) continue;
    const nome = rotuloAtendente(r.atendente);
    porAtendente.set(nome, [...(porAtendente.get(nome) ?? []), r]);
  }
  const atendentes: LinhaAtendente[] = [...porAtendente.entries()]
    .map(([nome, lista]) => ({
      nome,
      quantidade: lista.length,
      mediaAtendimento: media(lista.flatMap((r) => (r.atendimento === null ? [] : [r.atendimento]))),
      mediaIndicaria: media(lista.flatMap((r) => (r.nps === null ? [] : [r.nps]))),
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome));
  return {
    total: respostas.length,
    porOrigem: {
      salao: respostas.filter((r) => r.origem === "salao").length,
      delivery: respostas.filter((r) => r.origem === "delivery").length,
      app: respostas.filter((r) => r.origem === "app").length,
    },
    medias,
    pedidoCerto: { certos: comPedido.filter((r) => r.pedidoCerto).length, total: comPedido.length },
    atendentes,
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
  media: "Média das notas de 1 a 5 desta pergunta: soma das notas dividida por quantas pessoas responderam essa pergunta.",
  pedidoCerto: "Delivery e apps: porcentagem de quem respondeu que o pedido chegou certinho, sem faltar nada, sobre quem respondeu essa pergunta.",
  atendentes: "Quantas avaliações citaram cada pessoa em \"quem atendeu\", com a média da nota de atendimento (1 a 5) e da nota de indicação (0 a 10) dessas avaliações.",
  nps:
    "NPS (de -100 a 100): porcentagem de quem deu 9 ou 10 na pergunta \"indicaria\" menos a porcentagem de quem deu de 0 a 6. Quem deu 7 ou 8 conta no total, mas não soma nem tira.",
  notasBaixas:
    "Avaliações com qualquer nota de estrelas até 2, nota de indicação até 6 ou pedido que veio errado. São as que viram alerta no WhatsApp de quem você marcou para receber.",
  espera: "Pergunta antiga (até 13/11/2026): quantas pessoas escolheram cada faixa de tempo de espera, e a porcentagem sobre quem respondeu.",
  conheceu: "Quantas pessoas escolheram cada forma de conhecer o restaurante, e a porcentagem sobre quem respondeu essa pergunta.",
} as const;

// ── CSV ──────────────────────────────────────────────────────────────────

/** Separador ";" (Excel em português), com BOM. `campoCsv` neutraliza fórmula. O WhatsApp só sai
 * de quem autorizou (quem não autorizou nem tem número guardado). */
export function gerarCsv(respostas: RespostaPainel[]): string {
  const cabecalho = [
    "Data e hora",
    "Origem",
    ...CHAVES_ESTRELAS.map((c) => `${definicao(c).nome} (1 a 5)`),
    "Pedido certo",
    "Quem atendeu",
    "Tempo de espera (antiga)",
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
      ...CHAVES_ESTRELAS.map((c) => {
        const n = notaDe(r, c);
        return n === null ? "" : String(n);
      }),
      r.pedidoCerto === null ? "" : r.pedidoCerto ? "Sim" : "Não",
      rotuloAtendente(r.atendente),
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
