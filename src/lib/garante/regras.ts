/** Regras puras do Checklist Garante (sem Next.js nem Supabase). O que decide
 * acesso, meta e conclusão está no banco (RPCs garante_*); aqui só o que a
 * tela precisa calcular e validar antes de mandar. */

import type { TipoItemGarante } from "./biblioteca";

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export type SituacaoAgenda = "pendente" | "em_andamento" | "concluida";
export type SituacaoTela = SituacaoAgenda | "atrasada";

/** Atrasada = passou do horário limite e não concluiu. Concluída depois do
 * prazo continua "concluída" (a pontualidade entra na nota, fase 2). */
export function situacaoNaTela(situacao: SituacaoAgenda, prazo: string | Date, agora: Date): SituacaoTela {
  if (situacao === "concluida") return "concluida";
  return new Date(prazo).getTime() < agora.getTime() ? "atrasada" : situacao;
}

export function concluidaNoPrazo(prazo: string | Date, concluidaEm: string | Date | null): boolean | null {
  if (!concluidaEm) return null;
  return new Date(concluidaEm).getTime() <= new Date(prazo).getTime();
}

export function percentual(respondidos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((respondidos / total) * 100));
}

/** Data de hoje no fuso da operação (Brasília), em AAAA-MM-DD. */
export function hojeOperacao(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Véspera de hoje no fuso da operação (fechamento que passa da meia-noite).
 * Conta em cima da data (sem fuso), nunca subtraindo 24 h do relógio. */
export function ontemOperacao(agora: Date = new Date()): string {
  const [a, m, d] = hojeOperacao(agora).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Item feito: o mesmo critério do banco (`garante_itens_completos`), usado na
 * tela para o progresso. "Não se aplica" com motivo, ou resposta com valor E,
 * se o item exige foto, com a foto enviada. */
export function itemCompleto(
  item: { foto_obrigatoria: boolean },
  resposta:
    | { naoSeAplica: boolean; valorBool: boolean | null; valorNumero: number | null; valorTexto: string | null; temFoto: boolean }
    | undefined,
): boolean {
  if (!resposta) return false;
  if (resposta.naoSeAplica) return true;
  const temValor = resposta.valorBool !== null || resposta.valorNumero !== null || (resposta.valorTexto ?? "") !== "";
  return temValor && (!item.foto_obrigatoria || resposta.temFoto);
}

/** Textos do ícone (i) dos indicadores do Garante. */
export const DICA_GARANTE = {
  progresso:
    "Itens feitos ÷ itens do checklist. Item feito = respondido (ou marcado \"não se aplica\" com motivo) e, se o item pede foto, com a foto enviada. Sem a foto obrigatória o item não conta.",
  foraDaMeta:
    "Itens cuja resposta ficou fora da meta do modelo: \"não feito\" num item de feito/não feito, ou número e estrelas fora da faixa definida.",
  diaConcluido: "Checklists concluídos ÷ checklists programados para hoje (os seus, ou todos da unidade se você é da gestão).",
  situacao:
    "Concluída = alguém concluiu com todos os itens feitos. Atrasada = passou do horário limite sem concluir. Em andamento = já começou. Pendente = ninguém começou.",
} as const;

export const LIMITE_NUMERO = 1_000_000;

export function textoDias(dias: number[]): string {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b);
  if (ordenados.length === 7) return "Todo dia";
  if (ordenados.join(",") === "1,2,3,4,5") return "Seg a Sex";
  return ordenados.map((d) => DIAS_SEMANA[d]).join(", ");
}

export type ResultadoPublicacao =
  | { ok: true; dias: number[]; horario: string }
  | { ok: false; erro: string };

/** Dias (0 a 6) e horário limite (HH:MM) vindos do formulário. */
export function validarPublicacao(params: { dias: string[]; horario: string }): ResultadoPublicacao {
  const dias = [...new Set(params.dias.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (dias.length === 0) return { ok: false, erro: "Escolha pelo menos um dia." };
  if (dias.length !== params.dias.length) return { ok: false, erro: "Dia inválido." };
  const m = params.horario.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return { ok: false, erro: "Horário limite inválido (use HH:MM)." };
  return { ok: true, dias: dias.sort((a, b) => a - b), horario: `${m[1]}:${m[2]}` };
}

export type ResultadoItem =
  | {
      ok: true;
      titulo: string;
      tipo: TipoItemGarante;
      critico: boolean;
      fotoObrigatoria: boolean;
      permiteNa: boolean;
      metaMin: number | null;
      metaMax: number | null;
    }
  | { ok: false; erro: string };

const TIPOS: TipoItemGarante[] = ["check", "numero", "estrelas", "texto"];

/** Item do modelo vindo do formulário. Crítico nunca aceita "não se aplica"
 * (mesma regra do banco). Meta só em número e estrelas. */
export function validarItem(params: {
  titulo: string;
  tipo: string;
  critico: boolean;
  fotoObrigatoria: boolean;
  permiteNa: boolean;
  metaMin: string;
  metaMax: string;
}): ResultadoItem {
  const titulo = params.titulo.trim();
  if (!titulo || titulo.length > 200) return { ok: false, erro: "Escreva o item (até 200 caracteres)." };
  if (!TIPOS.includes(params.tipo as TipoItemGarante)) return { ok: false, erro: "Tipo de item inválido." };
  const tipo = params.tipo as TipoItemGarante;
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const naoFinito = (v: number | null) => v !== null && (!Number.isFinite(v) || Math.abs(v) > LIMITE_NUMERO);
  let metaMin = tipo === "numero" || tipo === "estrelas" ? num(params.metaMin) : null;
  let metaMax = tipo === "numero" || tipo === "estrelas" ? num(params.metaMax) : null;
  if (naoFinito(metaMin) || naoFinito(metaMax)) {
    return { ok: false, erro: "Meta precisa ser um número (até 1.000.000)." };
  }
  if (tipo === "estrelas") {
    const fora = (v: number | null) => v !== null && (v < 1 || v > 5 || !Number.isInteger(v));
    if (fora(metaMin) || fora(metaMax)) return { ok: false, erro: "Meta de estrelas vai de 1 a 5." };
  }
  if (metaMin !== null && metaMax !== null && metaMin > metaMax) {
    [metaMin, metaMax] = [metaMax, metaMin];
  }
  return {
    ok: true,
    titulo,
    tipo,
    critico: params.critico,
    fotoObrigatoria: params.fotoObrigatoria,
    permiteNa: params.critico ? false : params.permiteNa,
    metaMin,
    metaMax,
  };
}

/** Texto curto da meta para mostrar ao lado do item. */
export function textoMeta(tipo: TipoItemGarante, min: number | null, max: number | null): string | null {
  if (tipo !== "numero" && tipo !== "estrelas") return null;
  const u = tipo === "estrelas" ? " estrelas" : "";
  if (min !== null && max !== null) return `meta: ${min} a ${max}${u}`;
  if (min !== null) return `meta: ${min}${u} ou mais`;
  if (max !== null) return `meta: até ${max}${u}`;
  return null;
}

/** Mensagens das RPCs para gente. */
export function mensagemErroGarante(mensagem: string): string {
  const mapa: Record<string, string> = {
    sem_permissao: "Esse checklist é de outra pessoa.",
    data_fora_da_janela: "Só dá para mexer no checklist de hoje ou no de ontem. Os mais antigos ficam só para consulta.",
    publicacao_nao_devida_nesta_data: "Esse checklist não está programado para hoje.",
    publicacao_nao_encontrada: "Checklist não encontrado.",
    execucao_nao_encontrada: "Checklist não encontrado.",
    execucao_concluida: "Esse checklist já foi concluído.",
    item_fora_do_checklist: "Esse item não faz parte deste checklist.",
    nao_se_aplica_proibido: "Item crítico não aceita \"não se aplica\".",
    justificativa_obrigatoria: "Explique por que não se aplica.",
    valor_obrigatorio: "Responda o item antes de salvar.",
    caminho_invalido: "Foto inválida. Tire de novo.",
    checklist_sem_itens: "Esse checklist não tem itens. Adicione pelo menos um antes.",
    responsavel_sem_acesso: "Essa pessoa não tem acesso a esta unidade. Cadastre o acesso dela em Equipe antes.",
    setor_invalido: "Setor não encontrado nesta unidade.",
    modelo_nao_encontrado: "Checklist não encontrado (ou já parou de ser usado).",
    foto_nao_recebida: "A foto não chegou. Tire de novo.",
  };
  const chave = Object.keys(mapa).find((k) => mensagem.includes(k));
  return chave ? mapa[chave] : "Não foi possível salvar. Tente de novo.";
}
