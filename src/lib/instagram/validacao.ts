import { z } from "zod";
import { paraDiaIso, paraMs } from "@/lib/operacao/validacao";
import {
  PERIODOS,
  type Automacao,
  type Concorrencia,
  type DadosPeriodo,
  type EnvioDirect,
  type FormatoMetricas,
  type LeituraInstagram,
  type Metricas,
  type NumerosPerfil,
  type NumerosPeriodo,
  type PalavraDirect,
  type Periodo,
} from "@/lib/instagram/tipos";

/** Entrada das actions (estrita, zod) e leitura do GET /zatti-hub/instagram
 * (tolerante: registro malformado sai da tela e é contado, para um dado
 * estranho no Vini nunca derrubar o painel). Número ausente fica `null`,
 * nunca 0: a tela mostra "sem dado". */

const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Código do post no Instagram (o que vem depois de /p/ ou /reel/). */
const CODIGO = /^[A-Za-z0-9_-]{5,40}$/;

export const palavraInstagramSchema = z
  .object({
    codigo: z.string().trim().regex(CODIGO, { message: "Post inválido" }),
    ativa: z.boolean(),
  })
  .strict();
export type EntradaPalavraInstagram = z.infer<typeof palavraInstagramSchema>;

/** Link de post ou reel do Instagram, só HTTPS. */
export function linkPostValido(v: string): boolean {
  try {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      /^(www\.)?instagram\.com$/i.test(u.hostname) &&
      /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]{5,40}\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}

function httpsValido(v: string): boolean {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

export const automacaoInstagramSchema = z
  .object({
    link: z.string().trim().max(300).refine(linkPostValido, { message: "Link do post inválido" }),
    palavra: z
      .string()
      .trim()
      .regex(/^[\p{L}\p{N}]{2,30}$/u, { message: "Palavra com 2 a 30 letras ou números, sem espaço" }),
    direct: z
      .string()
      .trim()
      .min(5)
      .max(900)
      .refine((v) => !CONTROLES.test(v), { message: "Texto com caractere inválido" }),
    linkEntrega: z
      .string()
      .trim()
      .max(1000)
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || httpsValido(v), { message: "Link de entrega precisa começar com https://" }),
  })
  .strict();
export type EntradaAutomacaoInstagram = z.infer<typeof automacaoInstagramSchema>;

// ── Leitura tolerante ──────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 1000): string => (typeof v === "string" ? v.slice(0, max) : "");
const strOuNull = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Número finito ou null. Nunca transforma ausência em 0. */
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const linkHttps = (v: unknown): string | null => {
  const s = strOuNull(v, 1000);
  return s && httpsValido(s) ? s : null;
};

function lerPalavra(b: unknown): PalavraDirect | null {
  if (!ehObj(b)) return null;
  const codigo = str(b.codigo, 60);
  if (!CODIGO.test(codigo) || typeof b.ativa !== "boolean") return null;
  return {
    codigo,
    link: linkHttps(b.link),
    post: str(b.post, 300),
    palavra: strOuNull(b.palavra, 60),
    direct: str(b.direct, 2000),
    linkEntrega: linkHttps(b.linkEntrega),
    envios: num(b.envios),
    ativa: b.ativa,
    origem: b.origem === "hub" ? "hub" : "base",
  };
}

function lerEnvio(b: unknown): EnvioDirect | null {
  if (!ehObj(b)) return null;
  const usuario = str(b.usuario, 60).replace(/^@/, "");
  if (!usuario) return null;
  return { em: paraMs(b.em), usuario, palavra: strOuNull(b.palavra, 60), codigo: str(b.codigo, 60) };
}

function lerNumeros(b: Obj): NumerosPeriodo {
  return {
    alcance: num(b.alcance),
    interacoes: num(b.interacoes),
    salvamentos: num(b.salvamentos),
    seguidoresNovos: num(b.seguidoresNovos),
    engajamento: num(b.engajamento),
  };
}

function lerPeriodo(b: unknown): DadosPeriodo | null {
  if (!ehObj(b)) return null;
  return { ...lerNumeros(b), anterior: ehObj(b.anterior) ? lerNumeros(b.anterior) : null };
}

function lerPerfil(b: unknown): NumerosPerfil {
  const o = ehObj(b) ? b : {};
  return { postsPorSemana: num(o.postsPorSemana), viewsPorPost: num(o.viewsPorPost), interacoesPorPost: num(o.interacoesPorPost) };
}

function lerFormato(b: unknown): FormatoMetricas | null {
  if (!ehObj(b)) return null;
  const formato = str(b.formato, 40);
  const posts = num(b.posts);
  if (!formato || posts == null) return null;
  return { formato, posts, viewsPorPost: num(b.viewsPorPost), salvamentosPorPost: num(b.salvamentosPorPost) };
}

function contar<T>(brutos: unknown[], ler: (b: unknown) => T | null): { ok: T[]; fora: number } {
  const lidos = brutos.map(ler);
  const ok = lidos.filter((x): x is T => x != null);
  return { ok, fora: lidos.length - ok.length };
}

function lerMetricas(b: unknown): { metricas: Metricas; fora: number } {
  const m = ehObj(b) ? b : {};
  const periodosBrutos = ehObj(m.periodos) ? m.periodos : {};
  const periodos = Object.fromEntries(PERIODOS.map((p) => [p, lerPeriodo(periodosBrutos[p])])) as Record<Periodo, DadosPeriodo | null>;
  const dias = contar(lista(m.porDia).slice(0, 120), (d) => {
    if (!ehObj(d)) return null;
    const dia = typeof d.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.dia) ? d.dia : null;
    return dia ? { dia, alcance: num(d.alcance) } : null;
  });
  const formatos = contar(lista(m.formatos).slice(0, 20), lerFormato);
  return {
    metricas: {
      atualizadoEm: paraMs(m.atualizadoEm),
      periodos,
      alcance90Somado: m.alcance90Somado === true,
      porDia: dias.ok.sort((a, c) => a.dia.localeCompare(c.dia)),
      voce: lerPerfil(m.voce),
      formatos: formatos.ok,
    },
    fora: dias.fora + formatos.fora,
  };
}

function lerConcorrencia(b: unknown): { concorrencia: Concorrencia; fora: number } {
  const c = ehObj(b) ? b : {};
  const perfis = contar(lista(c.perfis).slice(0, 30), (p) => {
    if (!ehObj(p)) return null;
    const perfil = str(p.perfil, 60).replace(/^@/, "");
    return perfil ? { perfil, ...lerPerfil(p) } : null;
  });
  return { concorrencia: { lidoEm: paraDiaIso(c.lidoEm), perfis: perfis.ok }, fora: perfis.fora };
}

/** Resposta do GET já conferida. `null` quando nem o envelope veio certo. */
export function lerRespostaInstagram(json: unknown): (LeituraInstagram & { ignorados: number }) | null {
  if (!ehObj(json) || json.ok !== true || !ehObj(json.automacao)) return null;
  const a = json.automacao;
  const palavras = contar(lista(a.palavras).slice(0, 200), lerPalavra);
  const ultimos = contar(lista(a.ultimos).slice(0, 20), lerEnvio);
  const automacao: Automacao = {
    ligada: a.ligada === true,
    pausadaAte: paraMs(a.pausadaAte),
    enviosHoje: num(a.enviosHoje),
    tempoRespostaSeg: num(a.tempoRespostaSeg),
    registroDesde: paraDiaIso(a.registroDesde),
    palavras: palavras.ok,
    ultimos: ultimos.ok,
  };
  const { metricas, fora: foraMetricas } = lerMetricas(json.metricas);
  const { concorrencia, fora: foraConc } = lerConcorrencia(json.concorrencia);
  return { automacao, metricas, concorrencia, ignorados: palavras.fora + ultimos.fora + foraMetricas + foraConc };
}
