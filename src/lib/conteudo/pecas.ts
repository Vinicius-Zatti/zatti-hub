/** Regras puras do Conteúdo (Escritório > Conteúdo), usadas na rota do Vini, nas Server Actions e
 * na tela. As mesmas listas e limites estão nos checks e na RPC `conteudo_aplicar_campos` da
 * migração 20261011130000: o banco é a barreira final, isto aqui devolve o erro antes e mais claro. */

export const STATUS_PECA = ["Ideia", "Roteiro pronto", "Gravado", "Editado", "Publicado Teste", "Publicado todos"] as const;
export type StatusPeca = (typeof STATUS_PECA)[number];

export const FORMATOS_PECA = [
  "Vídeo lo-fi frontal",
  "Vídeo câmera traseira",
  "Caixinha de perguntas",
  "Tela verde",
  "Carrossel de fotos",
  "Crença escrita",
  "Quebra de expectativa",
  "Vídeo texto (b-roll)",
] as const;
export type FormatoPeca = (typeof FORMATOS_PECA)[number] | "";

export const ETAPAS_FUNIL = ["Topo", "Meio", "Fundo"] as const;
export type EtapaFunil = (typeof ETAPAS_FUNIL)[number] | "";

export const LIMITES_PECA = {
  titulo: 200,
  roteiro: 20000,
  legenda: 5000,
  link_referencia: 1000,
  link_arquivos: 1000,
  observacao: 2000,
} as const;

/** Campos que o Vini e a tela podem gravar (origem_notion_id só no POST da migração). */
export const CAMPOS_EDITAVEIS = [
  "titulo",
  "data",
  "hora",
  "status",
  "formato",
  "etapa_funil",
  "roteiro",
  "legenda",
  "link_referencia",
  "link_arquivos",
  "observacao",
] as const;
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];
export type CamposPeca = Partial<Record<CampoEditavel, string | null>>;

/** Peça como a API devolve (todas as colunas da tabela, snake_case, hora "HH:MM"). */
export type Peca = {
  id: string;
  titulo: string;
  data: string | null;
  hora: string | null;
  status: StatusPeca;
  formato: FormatoPeca;
  etapa_funil: EtapaFunil;
  roteiro: string;
  legenda: string;
  link_referencia: string;
  link_arquivos: string;
  observacao: string;
  origem_notion_id: string | null;
  versao: number;
  criado_em: string;
  atualizado_em: string;
  criado_por: string;
  atualizado_por: string;
  origem_ultima_mudanca: "hub" | "vini" | "import";
};

export type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "AAAA-MM-DD" que existe no calendário (31/02 não passa). */
export function dataIsoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function horaValida(valor: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(valor);
}

/** Valida e normaliza os campos de uma peça. `parcial` = PATCH (só as chaves enviadas); no POST o
 * título é obrigatório. Chave desconhecida é erro (nada é ignorado em silêncio). */
export function validarCamposPeca(entrada: Record<string, unknown>, parcial: boolean): Validacao<CamposPeca> {
  const campos: CamposPeca = {};
  for (const [chave, bruto] of Object.entries(entrada)) {
    if (!(CAMPOS_EDITAVEIS as readonly string[]).includes(chave)) return { ok: false, erro: `campo não permitido: ${chave}` };
    if (bruto !== null && typeof bruto !== "string") return { ok: false, erro: `campo inválido: ${chave}` };
    const v = bruto as string | null;
    const k = chave as CampoEditavel;
    switch (k) {
      case "titulo": {
        const t = (v ?? "").trim();
        if (!t || t.length > LIMITES_PECA.titulo) return { ok: false, erro: "campo inválido: titulo" };
        campos.titulo = t;
        break;
      }
      case "data": {
        const t = (v ?? "").trim();
        if (t && !dataIsoValida(t)) return { ok: false, erro: "campo inválido: data (use AAAA-MM-DD)" };
        campos.data = t || null;
        break;
      }
      case "hora": {
        const t = (v ?? "").trim();
        if (t && !horaValida(t)) return { ok: false, erro: "campo inválido: hora (use HH:MM)" };
        campos.hora = t ? t.slice(0, 5) : null;
        break;
      }
      case "status":
        if (!v || !(STATUS_PECA as readonly string[]).includes(v)) return { ok: false, erro: "campo inválido: status" };
        campos.status = v;
        break;
      case "formato":
        if (v && !(FORMATOS_PECA as readonly string[]).includes(v)) return { ok: false, erro: "campo inválido: formato" };
        campos.formato = v ?? "";
        break;
      case "etapa_funil":
        if (v && !(ETAPAS_FUNIL as readonly string[]).includes(v)) return { ok: false, erro: "campo inválido: etapa_funil" };
        campos.etapa_funil = v ?? "";
        break;
      default: {
        const t = k === "link_referencia" || k === "link_arquivos" ? (v ?? "").trim() : (v ?? "");
        if (t.length > LIMITES_PECA[k]) return { ok: false, erro: `campo inválido: ${k} (máximo ${LIMITES_PECA[k]} caracteres)` };
        campos[k] = t;
      }
    }
  }
  if (!parcial && campos.titulo === undefined) return { ok: false, erro: "campo inválido: titulo" };
  if (parcial && Object.keys(campos).length === 0) return { ok: false, erro: "nenhum campo para mudar" };
  return { ok: true, valor: campos };
}

export type CorpoCriar = CamposPeca & { origem_notion_id?: string };
export type CorpoAtualizar = { id: string; versao: number; campos: CamposPeca };

function objeto(corpo: unknown): Record<string, unknown> | null {
  return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
}

export function validarCorpoCriar(corpo: unknown): Validacao<CorpoCriar> {
  const o = objeto(corpo);
  if (!o) return { ok: false, erro: "corpo inválido" };
  const { origem_notion_id: notion, ...resto } = o;
  if (notion !== undefined && notion !== null && (typeof notion !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(notion))) {
    return { ok: false, erro: "campo inválido: origem_notion_id" };
  }
  const r = validarCamposPeca(resto, false);
  if (!r.ok) return r;
  return { ok: true, valor: typeof notion === "string" ? { ...r.valor, origem_notion_id: notion } : r.valor };
}

export function validarCorpoAtualizar(corpo: unknown): Validacao<CorpoAtualizar> {
  const o = objeto(corpo);
  if (!o) return { ok: false, erro: "corpo inválido" };
  const { id, versao, ...resto } = o;
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, erro: "campo inválido: id" };
  if (typeof versao !== "number" || !Number.isInteger(versao) || versao < 1 || versao > 2147483647) return { ok: false, erro: "campo inválido: versao" };
  const r = validarCamposPeca(resto, true);
  if (!r.ok) return r;
  return { ok: true, valor: { id, versao, campos: r.valor } };
}

/** Período do GET: os dois ou nenhum (nenhum = todas as peças), até 366 dias. */
export function validarPeriodo(de: string | null, ate: string | null): Validacao<{ de: string | null; ate: string | null }> {
  if (!de && !ate) return { ok: true, valor: { de: null, ate: null } };
  if (!de || !ate || !dataIsoValida(de) || !dataIsoValida(ate)) return { ok: false, erro: "período inválido: use de e ate em AAAA-MM-DD" };
  const dias = diferencaDias(de, ate);
  if (dias < 0 || dias > 366) return { ok: false, erro: "período inválido: ate antes de de ou mais de 366 dias" };
  return { ok: true, valor: { de, ate } };
}

// ── Datas da tela (string pura, sem fuso) ─────────────────────────────────

function paraUtc(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  return deUtc(paraUtc(iso) + dias * 86_400_000);
}

export function diferencaDias(de: string, ate: string): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / 86_400_000);
}

/** Segunda-feira da semana da data (semana de segunda a domingo). */
export function inicioDaSemana(iso: string): string {
  const diaSemana = new Date(paraUtc(iso)).getUTCDay(); // 0 = domingo
  return somarDias(iso, diaSemana === 0 ? -6 : 1 - diaSemana);
}

export function diasDaSemana(segunda: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function nomeDoDia(iso: string): string {
  return NOMES_DIA[new Date(paraUtc(iso)).getUTCDay()];
}

/** Peças do dia, com hora primeiro (em ordem) e as sem hora no fim. */
export function pecasDoDia<T extends Pick<Peca, "data" | "hora" | "titulo">>(pecas: T[], dia: string): T[] {
  return pecas
    .filter((p) => p.data === dia)
    .sort((a, b) => (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99") || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** Lista: mais recentes primeiro; sem data no fim. */
export function ordenarLista<T extends Pick<Peca, "data" | "hora" | "titulo">>(pecas: T[]): T[] {
  return [...pecas].sort((a, b) => {
    if (a.data !== b.data) {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return b.data.localeCompare(a.data);
    }
    return (a.hora ?? "99:99").localeCompare(b.hora ?? "99:99") || a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

export function contarPorStatus(pecas: Pick<Peca, "status">[]): Record<StatusPeca, number> {
  const c = Object.fromEntries(STATUS_PECA.map((s) => [s, 0])) as Record<StatusPeca, number>;
  for (const p of pecas) if (p.status in c) c[p.status] += 1;
  return c;
}

/** Linha do banco (select da tela: hora "HH:MM:SS") para a Peca do contrato. */
export function normalizarPeca(linha: Record<string, unknown>): Peca {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const sn = (v: unknown) => (typeof v === "string" && v ? v : null);
  const hora = sn(linha.hora);
  return {
    id: s(linha.id),
    titulo: s(linha.titulo),
    data: sn(linha.data),
    hora: hora ? hora.slice(0, 5) : null,
    status: s(linha.status) as StatusPeca,
    formato: s(linha.formato) as FormatoPeca,
    etapa_funil: s(linha.etapa_funil) as EtapaFunil,
    roteiro: s(linha.roteiro),
    legenda: s(linha.legenda),
    link_referencia: s(linha.link_referencia),
    link_arquivos: s(linha.link_arquivos),
    observacao: s(linha.observacao),
    origem_notion_id: sn(linha.origem_notion_id),
    versao: Number(linha.versao) || 1,
    criado_em: s(linha.criado_em),
    atualizado_em: s(linha.atualizado_em),
    criado_por: s(linha.criado_por),
    atualizado_por: s(linha.atualizado_por),
    origem_ultima_mudanca: (s(linha.origem_ultima_mudanca) || "hub") as Peca["origem_ultima_mudanca"],
  };
}

/** Erro da RPC `conteudo_api_*` para o status do contrato (401/400/404/409; o resto é 503). */
export function erroRpcParaHttp(e: { code?: string; message?: string }): { status: number; erro: string } {
  const m = e.message ?? "";
  if (e.code === "42501") return { status: 401, erro: "não autorizado" };
  if (e.code === "P0002") return { status: 404, erro: "peça não encontrada" };
  if (e.code === "PT409" || m.includes("Versao divergente")) {
    return { status: 409, erro: "a peça mudou desde a última leitura: leia de novo e reenvie com a versão atual" };
  }
  if (["22023", "22007", "22008", "22P02", "23514", "23502"].includes(e.code ?? "")) {
    if (m.startsWith("Periodo")) return { status: 400, erro: "período inválido" };
    if (m.startsWith("Nenhum")) return { status: 400, erro: "nenhum campo para mudar" };
    const campo = /Campo (?:invalido|nao permitido): (\w+)/.exec(m)?.[1];
    return { status: 400, erro: campo ? `campo inválido: ${campo}` : "dados inválidos" };
  }
  return { status: 503, erro: "indisponível" };
}
