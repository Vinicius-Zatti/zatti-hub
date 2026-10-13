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
  janela:
    "Começar: a partir do horário limite menos a antecedência da unidade. Responder, tirar foto e concluir: até o fim do dia do checklist (23h59) ou, se a gestão definiu uma tolerância de atraso, até o horário limite mais a tolerância (nunca depois das 23h59). Concluir depois do horário limite conta como atraso na nota. Tudo em Modelos e publicação > Regras da unidade (gestão).",
  situacao:
    "Concluída = alguém concluiu com todos os itens feitos. Atrasada = passou do horário limite sem concluir. Em andamento = já começou. Pendente = ninguém começou.",
} as const;

export const LIMITE_NUMERO = 1_000_000;

export type EstadoJanela = "antes" | "aberta" | "fechada";

/** Onde o relógio está na janela do checklist (mesma regra das RPCs): começar
 * só a partir de `abreEm`; responder, foto e concluir até `fechaEm`. */
export function estadoJanela(abreEm: string | Date, fechaEm: string | Date, agora: Date): EstadoJanela {
  if (agora.getTime() < new Date(abreEm).getTime()) return "antes";
  if (agora.getTime() > new Date(fechaEm).getTime()) return "fechada";
  return "aberta";
}

/** Hora (HH:MM) e, se não for o dia de referência, a data (DD/MM) no fuso da operação. */
export function horaOperacao(instante: string | Date, diaReferencia?: string): string {
  const d = new Date(instante);
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
  if (!diaReferencia || hojeOperacao(d) === diaReferencia) return hora;
  const [, m, dia] = hojeOperacao(d).split("-");
  return `${dia}/${m} ${hora}`;
}

/** Soma dias a uma data AAAA-MM-DD sem passar por fuso. */
export function somarDias(dataIso: string, dias: number): string {
  const [a, m, d] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Dia da agenda que a tela mostra: hoje, o de ontem que ainda aceita (fechamento
 * depois da meia-noite) e o de amanhã cuja antecedência já abriu (checklist de
 * 01h com 2 h de antecedência começa às 23h da véspera). */
export type DiaAgenda = "ontem" | "hoje" | "amanha";

/** Data AAAA-MM-DD do dia da agenda, no fuso da operação. */
export function dataDoDiaAgenda(dia: DiaAgenda, agora: Date = new Date()): string {
  const hoje = hojeOperacao(agora);
  return dia === "ontem" ? somarDias(hoje, -1) : dia === "amanha" ? somarDias(hoje, 1) : hoje;
}

/** Hoje aparece sempre. Ontem: só o que não concluiu e ainda está na janela.
 * Amanhã: só o que já começou ou cuja janela já abriu. */
export function mostrarNaAgenda(
  dia: DiaAgenda,
  linha: { situacao: SituacaoAgenda; execucaoId: string | null; abreEm: string | Date; fechaEm: string | Date },
  agora: Date,
): boolean {
  if (dia === "hoje") return true;
  const janela = estadoJanela(linha.abreEm, linha.fechaEm, agora);
  if (dia === "ontem") return linha.situacao !== "concluida" && janela !== "fechada";
  return linha.execucaoId !== null || janela === "aberta";
}

/** Padrão da unidade sem regra cadastrada: abre 2 h antes e aceita concluir até
 * o fim do dia (`atrasoMaxMin` nulo, decisão 3 de Vinícius em 13/10/2026). */
export const REGRA_PADRAO = { antecedenciaMin: 120, atrasoMaxMin: null, prazoPlanoHoras: 24 } as const;

export type ResultadoRegra =
  | { ok: true; antecedenciaMin: number; atrasoMaxMin: number | null; prazoPlanoHoras?: number }
  | { ok: false; erro: string };

/** Antecedência (0 a 720 min), tolerância de atraso (nulo = até o fim do dia, ou
 * 0 a 1.440 min) e, quando vier, o prazo do plano de ação (1 a 168 h), inteiros.
 * Mesmos limites do banco. Sem o prazo do plano, o banco mantém o que valia. */
export function validarRegra(params: {
  antecedenciaMin: number | null;
  atrasoMaxMin: number | null;
  prazoPlanoHoras?: number | null;
}): ResultadoRegra {
  const { antecedenciaMin: a, atrasoMaxMin: b, prazoPlanoHoras: c } = params;
  if (a === null || !Number.isInteger(a) || a < 0 || a > 720) {
    return { ok: false, erro: "Antecedência em minutos inteiros, de 0 a 720 (12 h)." };
  }
  if (b !== null && (!Number.isInteger(b) || b < 0 || b > 1440)) {
    return { ok: false, erro: "Tolerância de atraso em minutos inteiros, de 0 a 1.440 (24 h), ou \"até o fim do dia\"." };
  }
  if (c === undefined) return { ok: true, antecedenciaMin: a, atrasoMaxMin: b };
  if (c === null || !Number.isInteger(c) || c < 1 || c > 168) {
    return { ok: false, erro: "Prazo do plano de ação em horas inteiras, de 1 a 168 (7 dias)." };
  }
  return { ok: true, antecedenciaMin: a, atrasoMaxMin: b, prazoPlanoHoras: c };
}

export type ResultadoDiaSemOperacao = { ok: true; data: string; motivo: string } | { ok: false; erro: string };

/** Dia sem operação: data a partir de amanhã e motivo de 3 a 200 caracteres. */
export function validarDiaSemOperacao(params: { data: string; motivo: string; hoje: string }): ResultadoDiaSemOperacao {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.data)) return { ok: false, erro: "Escolha a data." };
  if (params.data <= params.hoje) return { ok: false, erro: "Só dá para marcar a partir de amanhã." };
  const motivo = params.motivo.trim();
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "Escreva o motivo (de 3 a 200 caracteres)." };
  return { ok: true, data: params.data, motivo };
}

/** Texto de minutos para gente: 90 -> "1 h 30 min". */
export function textoMinutos(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Até quando dá para concluir, para gente: nulo = "até o fim do dia (23h59)";
 * 45 -> "até 45 min depois do horário limite". */
export function textoAtraso(min: number | null): string {
  if (min === null) return "até o fim do dia (23h59)";
  return `até ${textoMinutos(min)} depois do horário limite`;
}

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
    data_fora_da_janela: "O prazo para mexer neste checklist já acabou (fim do dia, ou a tolerância de atraso que a gestão definiu). Ele fica só para consulta.",
    janela_ainda_nao_abriu: "Esse checklist ainda não abriu. Ele abre um tempo antes do horário limite (regra da unidade).",
    unidade_fechada_nesta_data: "A unidade não opera nesta data (dia sem operação).",
    so_data_futura: "Só dá para mudar daqui para a frente: escolha uma data a partir de amanhã.",
    regra_invalida: "Antecedência vai de 0 a 720 minutos (12 h); tolerância de atraso é \"até o fim do dia\" ou de 0 a 1.440 minutos (24 h); prazo do plano de ação de 1 a 168 horas.",
    motivo_obrigatorio: "Escreva o motivo (de 3 a 200 caracteres).",
    data_com_checklist: "Já tem checklist começado nesta data, então ela não pode virar dia sem operação.",
    periodo_invalido: "Período inválido (até 93 dias).",
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
    plano_nao_encontrado: "Plano de ação não encontrado.",
    plano_fechado: "Esse plano de ação já foi resolvido ou descartado.",
    plano_imutavel: "Origem, responsável e prazo do plano de ação não mudam.",
    resolucao_obrigatoria: "Escreva o que foi feito para resolver (de 3 a 500 caracteres).",
    motivo_descarte_obrigatorio: "Escreva o motivo do descarte (de 3 a 500 caracteres).",
  };
  const chave = Object.keys(mapa).find((k) => mensagem.includes(k));
  return chave ? mapa[chave] : "Não foi possível salvar. Tente de novo.";
}
