import { z } from "zod";
import { ErroPublico } from "@/lib/erros";
import { dataIsoBrasil } from "@/lib/operacao/quadro";
import {
  ACOES_ITEM,
  ACOES_POST,
  COLUNAS,
  ESTADOS_TAREFA,
  LADOS_TAREFA,
  TIPOS_ITEM,
  type AcaoItem,
  type Coluna,
  type DetalheItem,
  type EstadoTarefa,
  type ItemOperacao,
  type LadoTarefa,
  type LeituraOperacao,
  type TarefaCliente,
  type TipoItem,
} from "@/lib/operacao/tipos";

/** Entrada das actions e leitura da resposta do Vini. A entrada é estrita
 * (zod); a leitura é tolerante: item malformado sai do quadro e é contado,
 * para um registro estranho no Vini nunca derrubar a tela inteira. */

const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const textoLivre = (maximo: number) =>
  z.string().trim().max(maximo).refine((v) => !CONTROLES.test(v), { message: "Texto com caractere inválido" });
const chaveSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .refine((v) => !CONTROLES.test(v) && !/[\r\n]/.test(v) && v.includes(":"), { message: "Cartão inválido" });

export const acaoOperacaoSchema = z
  .object({
    chave: chaveSchema,
    acao: z.enum(ACOES_POST),
    coluna: z.enum(COLUNAS).optional(),
    texto: textoLivre(4000).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.acao === "coluna" && !e.coluna) ctx.addIssue({ code: "custom", path: ["coluna"], message: "Informe a coluna" });
    if (e.acao !== "coluna" && e.coluna) ctx.addIssue({ code: "custom", path: ["coluna"], message: "Coluna só vale para mover" });
    if (e.acao === "nota" && e.texto === undefined) ctx.addIssue({ code: "custom", path: ["texto"], message: "Informe a nota" });
    if (e.acao === "nota" && (e.texto?.length ?? 0) > 1000) ctx.addIssue({ code: "custom", path: ["texto"], message: "Nota longa demais" });
    if (e.acao === "enviar_texto" && !e.texto) ctx.addIssue({ code: "custom", path: ["texto"], message: "Escreva o texto" });
  });
export type EntradaAcaoOperacao = z.infer<typeof acaoOperacaoSchema>;

export const tarefaOperacaoSchema = z
  .object({
    id: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9_-]+#\d{1,4}$/, { message: "Tarefa inválida" }),
    estado: z.enum(ESTADOS_TAREFA),
  })
  .strict();
export type EntradaTarefaOperacao = z.infer<typeof tarefaOperacaoSchema>;

/** Mesma mensagem genérica do `validarEntrada` do app, sem revelar o schema. */
export function validarEntradaOperacao<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const r = schema.safeParse(entrada);
  if (r.success) return r.data;
  const campo = r.error.issues[0]?.path.join(".");
  throw new ErroPublico(campo ? `Campo inválido: ${campo}` : "Dados inválidos");
}

// ── Leitura tolerante do GET /zatti-hub/operacao ───────────────────────────

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 4000): string => (typeof v === "string" ? v.slice(0, max) : "");
const strOuNull = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const umDe = <T extends string>(opcoes: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (opcoes as readonly string[]).includes(v) ? (v as T) : null;

/** ms (número), texto numérico ou data ISO -> ms. Qualquer outra coisa = null. */
export function paraMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim()) {
    if (/^\d{10,14}$/.test(v.trim())) return Number(v.trim());
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Dia da reunião: "AAAA-MM-DD" fica como está (sem passar por Date, que
 * puxaria para o dia anterior no fuso); data com hora ou ms vira o dia em Brasília. */
export function paraDiaIso(v: unknown): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  const ms = paraMs(v);
  return ms == null ? null : dataIsoBrasil(ms);
}

function lerDetalhe(tipo: TipoItem, bruto: unknown): DetalheItem {
  const d = ehObj(bruto) ? bruto : {};
  if (tipo === "demanda") {
    const r = ehObj(d.resposta) ? d.resposta : null;
    return {
      tipo,
      autor: str(d.autor, 200),
      canalNome: strOuNull(d.canalNome),
      area: strOuNull(d.area),
      mensagens: lista(d.mensagens)
        .filter(ehObj)
        .slice(0, 200)
        .map((m) => ({ autor: str(m.autor, 200), texto: str(m.texto), em: paraMs(m.em), equipe: m.equipe === true })),
      resposta: r
        ? { texto: str(r.texto), situacao: str(r.situacao, 80), vez: typeof r.vez === "number" ? r.vez : null, motivo: strOuNull(r.motivo, 500) }
        : null,
    };
  }
  if (tipo === "ata") {
    return {
      tipo,
      reuniaoEm: paraDiaIso(d.reuniaoEm),
      resumo: str(d.resumo),
      decisoes: lista(d.decisoes).filter((x): x is string => typeof x === "string").slice(0, 100),
      tarefas: lista(d.tarefas)
        .filter(ehObj)
        .slice(0, 200)
        .map((t) => ({
          responsavel: str(t.responsavel, 200),
          lado: umDe<LadoTarefa>(LADOS_TAREFA, t.lado) ?? "indefinido",
          tarefa: str(t.tarefa, 1000),
          prazo: str(t.prazo, 200),
        })),
      mensagem: str(d.mensagem),
      canalNome: strOuNull(d.canalNome),
    };
  }
  if (tipo === "pauta") return { tipo, reuniaoEm: paraDiaIso(d.reuniaoEm), mensagem: str(d.mensagem), canalNome: strOuNull(d.canalNome) };
  return { tipo, texto: str(d.texto) };
}

function lerItem(bruto: unknown): ItemOperacao | null {
  if (!ehObj(bruto)) return null;
  const tipo = umDe<TipoItem>(TIPOS_ITEM, bruto.tipo);
  const coluna = umDe<Coluna>(COLUNAS, bruto.coluna);
  const chave = str(bruto.chave, 200);
  if (!tipo || !coluna || !chave.includes(":")) return null;
  return {
    chave,
    tipo,
    subtipo: strOuNull(bruto.subtipo, 60),
    codigo: str(bruto.codigo, 120) || chave.slice(chave.indexOf(":") + 1),
    cliente: strOuNull(bruto.cliente),
    sigla: strOuNull(bruto.sigla, 20),
    titulo: str(bruto.titulo, 300),
    resumo: str(bruto.resumo, 300),
    coluna,
    colunaManual: bruto.colunaManual === true,
    criadoEm: paraMs(bruto.criadoEm),
    desdeEm: paraMs(bruto.desdeEm),
    encerradoEm: paraMs(bruto.encerradoEm),
    nota: str(bruto.nota, 1000),
    acoes: lista(bruto.acoes).filter((a): a is AcaoItem => umDe(ACOES_ITEM, a) != null),
    detalhe: lerDetalhe(tipo, bruto.detalhe),
  };
}

function lerTarefa(bruto: unknown): TarefaCliente | null {
  if (!ehObj(bruto)) return null;
  const id = str(bruto.id, 80);
  const estado = umDe<EstadoTarefa>(ESTADOS_TAREFA, bruto.estado) ?? "a_fazer";
  if (!id) return null;
  return {
    id,
    ataCodigo: str(bruto.ataCodigo, 80),
    cliente: strOuNull(bruto.cliente),
    sigla: strOuNull(bruto.sigla, 20),
    responsavel: str(bruto.responsavel, 200),
    lado: umDe<LadoTarefa>(LADOS_TAREFA, bruto.lado) ?? "indefinido",
    tarefa: str(bruto.tarefa, 1000),
    prazo: str(bruto.prazo, 200),
    estado,
    atualizadoEm: paraMs(bruto.atualizadoEm),
    reuniaoEm: paraDiaIso(bruto.reuniaoEm),
  };
}

/** Resposta do GET já conferida. `null` quando nem o envelope veio certo. */
export function lerRespostaOperacao(json: unknown): (LeituraOperacao & { ignorados: number }) | null {
  if (!ehObj(json) || !Array.isArray(json.itens) || !Array.isArray(json.tarefas)) return null;
  const itens = json.itens.map(lerItem);
  const tarefas = json.tarefas.map(lerTarefa);
  const okItens = itens.filter((i): i is ItemOperacao => i != null);
  const okTarefas = tarefas.filter((t): t is TarefaCliente => t != null);
  return {
    geradoEm: paraMs(json.geradoEm),
    itens: okItens,
    tarefas: okTarefas,
    ignorados: itens.length - okItens.length + tarefas.length - okTarefas.length,
  };
}
