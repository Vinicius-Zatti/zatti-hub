import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { linhaCsv } from "@/lib/csv";
import {
  CHAVES_ESTRELAS,
  OPCOES_CONHECEU,
  OPCOES_ESPERA,
  ROTULO_ORIGEM,
  definicao,
  rotuloAtendente,
  rotuloOpcao,
  type ChavePergunta,
  type Opcao,
  type Origem,
  type PerguntaConfig,
  type TipoLivre,
} from "./perguntas";

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
  /** Respostas das perguntas da gestão (14/11/2026), pela chave. */
  extras: Record<string, unknown> | null;
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

// ── Perguntas da gestão (14/11/2026) ─────────────────────────────────────

export type ResumoLivre = {
  chave: string;
  texto: string;
  tipo: TipoLivre;
  respostas: number;
  /** Estrelas: média de 1 a 5. */
  media: number | null;
  /** Sim ou não: quantos disseram sim. */
  sim: number;
  /** Lista de opções: quantos escolheram cada uma. */
  opcoes: ItemDistribuicao[];
  /** Texto: o que escreveram, mais novo primeiro (até 20). */
  textos: string[];
};

/** Resultado de cada pergunta da gestão que teve resposta no recorte (ou que está na lista atual). */
export function resumirLivres(respostas: RespostaPainel[], livres: PerguntaConfig[], atuais: readonly string[] = []): ResumoLivre[] {
  return livres.flatMap((p) => {
    const valores = respostas.flatMap((r) => (r.extras && p.chave in r.extras ? [r.extras[p.chave]] : []));
    if (valores.length === 0 && !atuais.includes(p.chave)) return [];
    const tipo = p.tipo ?? "estrelas";
    const numeros = valores.filter((v): v is number => typeof v === "number");
    const textos = valores.filter((v): v is string => typeof v === "string");
    return [
      {
        chave: p.chave,
        texto: p.texto,
        tipo,
        respostas: valores.length,
        media: tipo === "estrelas" ? media(numeros) : null,
        sim: valores.filter((v) => v === true).length,
        opcoes: tipo === "escolha" ? distribuir(textos, (p.opcoes ?? []).map((o) => ({ valor: o, rotulo: o }))) : [],
        textos: tipo === "texto" ? textos.slice(0, 20) : [],
      },
    ];
  });
}

/** Resposta de uma pergunta da gestão como texto (CSV e lista). */
export function textoLivre(valor: unknown): string {
  if (valor === true) return "Sim";
  if (valor === false) return "Não";
  if (typeof valor === "number" || typeof valor === "string") return String(valor).replace(/\r?\n/g, " ");
  return "";
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
  leitura:
    "Frases montadas pelo app com os números da tela, comparando com o período anterior do mesmo tamanho (7, 30 ou 90 dias antes) e na mesma origem. Só compara e aponta o ponto mais forte e o mais fraco quando há ao menos 5 respostas. NPS: zona crítica até 0, aperfeiçoamento de 1 a 50, qualidade de 51 a 75 e excelência acima de 75.",
  conheceu: "Quantas pessoas escolheram cada forma de conhecer o restaurante, e a porcentagem sobre quem respondeu essa pergunta.",
} as const;

// ── CSV ──────────────────────────────────────────────────────────────────

/** Separador ";" (Excel em português), com BOM. `campoCsv` neutraliza fórmula. O WhatsApp só sai
 * de quem autorizou (quem não autorizou nem tem número guardado). */
export function gerarCsv(respostas: RespostaPainel[], livres: PerguntaConfig[] = []): string {
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
    ...livres.map((p) => p.texto),
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
      ...livres.map((p) => textoLivre(r.extras?.[p.chave])),
      r.notaBaixa ? "Sim" : "Não",
      r.whatsapp && r.consentimentoEm ? formatarWhatsapp(r.whatsapp) : "",
      r.whatsapp && r.consentimentoEm ? dataHoraBr(r.consentimentoEm) : "",
    ]),
  );
  return "﻿" + [linhaCsv(cabecalho), ...linhas].join("\r\n") + "\r\n";
}

// ── Gráficos e leitura (14/11/2026) ──────────────────────────────────────

/** Início do período anterior, do mesmo tamanho, para comparar (meia-noite de Brasília). */
export function inicioAnterior(periodo: Periodo, de: string): string {
  return `${somarDiasIso(de, -Number(periodo))}T03:00:00.000Z`;
}

/** Dia (AAAA-MM-DD) de Brasília de um instante. */
export function diaBr(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export type PontoDia = { dia: string; total: number; notasBaixas: number };

/** Avaliações por dia do período (dias sem avaliação entram com zero), com as notas baixas de cada dia. */
export function serieDiaria(respostas: RespostaPainel[], de: string, ate: string): PontoDia[] {
  const mapa = new Map<string, PontoDia>();
  for (let d = de; d <= ate; d = somarDiasIso(d, 1)) mapa.set(d, { dia: d, total: 0, notasBaixas: 0 });
  for (const r of respostas) {
    const p = mapa.get(diaBr(r.criadoEm));
    if (!p) continue;
    p.total += 1;
    if (r.notaBaixa) p.notasBaixas += 1;
  }
  return [...mapa.values()];
}

/** Faixa do NPS como o mercado lê: crítica (até 0), aperfeiçoamento (1 a 50), qualidade (51 a 75) e excelência (76 a 100). */
export function zonaNps(nps: number): string {
  if (nps <= 0) return "zona crítica";
  if (nps <= 50) return "zona de aperfeiçoamento";
  if (nps <= 75) return "zona de qualidade";
  return "zona de excelência";
}

/** Base mínima para comparar com o período anterior ou apontar a pergunta mais forte e a mais fraca. */
export const BASE_MINIMA_LEITURA = 5;

function formatarNumero(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Leitura curta do período, só com o que os números mostram (sem palpite de causa). Frases na
 * ordem: volume, NPS, pergunta mais forte e mais fraca, pedido certo, notas baixas e alerta de base pequena. */
export function gerarLeitura(atual: ResumoAvaliacoes, anterior: ResumoAvaliacoes | null): string[] {
  if (atual.total === 0) return [];
  const comparar = anterior !== null && anterior.total >= BASE_MINIMA_LEITURA && atual.total >= BASE_MINIMA_LEITURA;
  const frases: string[] = [];

  const volume = `${atual.total === 1 ? "Chegou 1 avaliação" : `Chegaram ${atual.total} avaliações`} no período`;
  if (anterior !== null && anterior.total > 0) {
    const dif = atual.total - anterior.total;
    frases.push(`${volume}, ${dif === 0 ? "o mesmo número" : `${Math.abs(dif)} a ${dif > 0 ? "mais" : "menos"}`} que no período anterior (${anterior.total}).`);
  } else frases.push(`${volume}.`);

  if (atual.nps.nps !== null) {
    let t = `O NPS está em ${atual.nps.nps}, ${zonaNps(atual.nps.nps)}`;
    if (comparar && anterior.nps.nps !== null) {
      const dif = atual.nps.nps - anterior.nps.nps;
      t += dif === 0 ? ", igual ao período anterior" : `, ${dif > 0 ? "subiu" : "caiu"} ${Math.abs(dif)} pontos (era ${anterior.nps.nps})`;
    }
    frases.push(`${t}: ${atual.nps.promotores} promotores e ${atual.nps.detratores} detratores.`);
  }

  const comBase = atual.medias.filter((m) => m.media !== null && m.respostas >= BASE_MINIMA_LEITURA);
  if (comBase.length >= 2) {
    const ordem = [...comBase].sort((a, b) => (b.media as number) - (a.media as number));
    const forte = ordem[0];
    const fraca = ordem[ordem.length - 1];
    if (forte.media !== fraca.media) {
      let t = `Ponto mais forte: ${forte.nome.toLowerCase()} (${formatarNumero(forte.media as number)}). Ponto mais fraco: ${fraca.nome.toLowerCase()} (${formatarNumero(fraca.media as number)})`;
      const antes = comparar ? anterior.medias.find((m) => m.chave === fraca.chave && m.respostas >= BASE_MINIMA_LEITURA) : undefined;
      if (antes?.media != null && antes.media !== fraca.media) t += `, ${(fraca.media as number) > antes.media ? "subiu" : "caiu"} de ${formatarNumero(antes.media)}`;
      frases.push(`${t}.`);
    }
  }

  const errados = atual.pedidoCerto.total - atual.pedidoCerto.certos;
  if (errados > 0) frases.push(`${errados} ${errados === 1 ? "pedido veio errado ou faltando" : "pedidos vieram errados ou faltando"}, ${Math.round((errados / atual.pedidoCerto.total) * 100)}% de quem respondeu.`);

  if (atual.notasBaixas > 0) frases.push(`${atual.notasBaixas} ${atual.notasBaixas === 1 ? "avaliação teve nota baixa" : "avaliações tiveram nota baixa"} (${Math.round((atual.notasBaixas / atual.total) * 100)}% do total): veja os comentários abaixo.`);
  else frases.push("Nenhuma nota baixa no período.");

  if (atual.total < 10) frases.push("Ainda são poucas avaliações: leia como sinal, não como tendência.");
  return frases;
}
