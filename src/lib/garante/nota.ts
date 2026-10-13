/** Nota P-E-Q do Checklist Garante (fórmula versão 1). O cálculo é do banco
 * (`garante_nota`); aqui só o que a tela precisa: período, formato e textos
 * do ícone (i). Sem Next.js nem Supabase. */

import { hojeOperacao, somarDias } from "./regras";

export const VERSAO_FORMULA_NOTA = 1;

export const PERIODOS_NOTA = [7, 30] as const;
export type PeriodoNota = (typeof PERIODOS_NOTA)[number];

/** Período vindo da URL: só 7 ou 30 dias; qualquer outra coisa vira 7. */
export function lerPeriodoNota(valor: string | undefined): PeriodoNota {
  return valor === "30" ? 30 : 7;
}

/** Últimos N dias contando hoje (no fuso da operação). O de hoje só entra na
 * nota depois de concluído ou de vencer a tolerância de atraso. */
export function intervaloNota(dias: PeriodoNota, agora: Date = new Date()): { de: string; ate: string } {
  const ate = hojeOperacao(agora);
  return { de: somarDias(ate, -(dias - 1)), ate };
}

/** Número da nota (0 a 100) inteiro para a tela; sem dado = "-". */
export function textoNota(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "-";
  return String(Math.round(valor));
}

export type LinhaNotaBruta = {
  nivel: "unidade" | "pessoa" | "setor";
  chave: string | null;
  previstas: number;
  concluidas: number;
  no_prazo: number;
  pontualidade: number | string | null;
  execucao: number | string | null;
  qualidade: number | string | null;
  nota: number | string | null;
  adesao: number | string | null;
  versao_formula: number;
};

export type LinhaNota = {
  nivel: "unidade" | "pessoa" | "setor";
  chave: string | null;
  previstas: number;
  concluidas: number;
  noPrazo: number;
  p: number | null;
  e: number | null;
  q: number | null;
  nota: number | null;
  adesao: number | null;
};

const num = (v: number | string | null): number | null => (v === null || v === "" ? null : Number(v));

/** Linha do banco (numeric vem como texto ou número) para a tela. */
export function normalizarLinhaNota(l: LinhaNotaBruta): LinhaNota {
  return {
    nivel: l.nivel,
    chave: l.chave,
    previstas: Number(l.previstas),
    concluidas: Number(l.concluidas),
    noPrazo: Number(l.no_prazo),
    p: num(l.pontualidade),
    e: num(l.execucao),
    q: num(l.qualidade),
    nota: num(l.nota),
    adesao: num(l.adesao),
  };
}

/** Pior nota primeiro (quem precisa de atenção no topo); sem dado por último. */
export function ordenarPorNota<T extends { nota: number | null; nome: string }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    if (a.nota === null && b.nota === null) return a.nome.localeCompare(b.nome);
    if (a.nota === null) return 1;
    if (b.nota === null) return -1;
    return a.nota - b.nota || a.nome.localeCompare(b.nome);
  });
}

/** Textos do ícone (i) da tela Nota. */
export const DICA_NOTA = {
  nota:
    "Nota = (P + E + Q) ÷ 3, cada um de 0 a 100. Se E e Q ficam sem valor (tudo \"não se aplica\"), a nota é só o P. Conta só checklist fechado: concluído, ou com a janela já vencida (fim do dia, ou a tolerância de atraso que a gestão definiu). Sem nenhum fechado no período, mostra \"-\".",
  p: "Pontualidade (P): média por checklist, 100 se foi concluído até o horário limite e 0 se concluiu no atraso ou não concluiu.",
  e: "Execução (E): média por checklist de itens feitos ÷ itens que valiam (sem os \"não se aplica\") x 100. Item com foto obrigatória sem a foto não conta como feito. Checklist que ninguém começou vale 0.",
  q: "Qualidade (Q): média por checklist de respostas dentro da meta ÷ respostas feitas (sem os \"não se aplica\") x 100. \"Não\" num item de feito/não feito e número ou estrelas fora da faixa ficam fora. Texto conta como dentro. Checklist que ninguém começou vale 0.",
  adesao:
    "Adesão = checklists concluídos ÷ checklists previstos já fechados x 100, no período. Separada da nota. Dia sem operação não entra.",
  previstas:
    "Checklists previstos no período (programação x dias da semana, fora dos dias sem operação) que já fecharam: concluídos, ou com a janela vencida (fim do dia, ou a tolerância de atraso que a gestão definiu).",
  concluidos: "Checklists concluídos (no prazo ou no atraso) de quantos estavam previstos e já fecharam no período.",
  pessoa: "Pessoa = responsável da programação do checklist. \"Qualquer pessoa da unidade\" junta os checklists sem responsável.",
} as const;
