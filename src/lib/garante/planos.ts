/** Plano de ação e card do Painel do Checklist Garante (fase 2b). Quem cria,
 * resolve e descarta o plano é o banco (`garante_concluir`,
 * `garante_gerar_planos_vencidos`, `garante_resolver_plano`,
 * `garante_descartar_plano`); aqui só o que a tela precisa calcular, validar e
 * explicar. Sem Next.js nem Supabase. */

import { mensagemErroGarante, situacaoNaTela, textoMeta, type SituacaoAgenda } from "./regras";
import type { TipoItemGarante } from "./biblioteca";

export type SituacaoPlano = "aberto" | "resolvido" | "descartado";
export type SituacaoPlanoTela = SituacaoPlano | "atrasado";

/** Atrasado = aberto e com o prazo já vencido. */
export function situacaoPlanoNaTela(situacao: SituacaoPlano, prazo: string | Date, agora: Date): SituacaoPlanoTela {
  if (situacao !== "aberto") return situacao;
  return new Date(prazo).getTime() < agora.getTime() ? "atrasado" : "aberto";
}

/** Abertos com atrasados no topo (o mais vencido primeiro), depois os no prazo
 * (o que vence antes primeiro). Fechados por último, o mais recente primeiro. */
export function ordenarPlanos<T extends { situacao: SituacaoPlano; prazo: string; fechadoEm: string | null }>(planos: T[], agora: Date): T[] {
  const peso = (p: T) => {
    const s = situacaoPlanoNaTela(p.situacao, p.prazo, agora);
    return s === "atrasado" ? 0 : s === "aberto" ? 1 : 2;
  };
  return [...planos].sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    if (pa === 2) return new Date(b.fechadoEm ?? 0).getTime() - new Date(a.fechadoEm ?? 0).getTime();
    return new Date(a.prazo).getTime() - new Date(b.prazo).getTime();
  });
}

export type ResultadoTexto = { ok: true; texto: string } | { ok: false; erro: string };

function validarTexto(texto: string, erro: string): ResultadoTexto {
  const t = texto.trim();
  if (t.length < 3 || t.length > 500) return { ok: false, erro };
  return { ok: true, texto: t };
}

/** Resolução: de 3 a 500 caracteres (mesmo limite do banco). */
export function validarResolucao(texto: string): ResultadoTexto {
  return validarTexto(texto, "Escreva o que foi feito para resolver (de 3 a 500 caracteres).");
}

/** Motivo do descarte: de 3 a 500 caracteres (mesmo limite do banco). */
export function validarMotivoDescarte(texto: string): ResultadoTexto {
  return validarTexto(texto, "Escreva o motivo do descarte (de 3 a 500 caracteres).");
}

/** Erros das RPCs de plano: "sem_permissao" aqui é sobre o plano, não o checklist. */
export function mensagemErroPlano(mensagem: string): string {
  if (mensagem.includes("sem_permissao")) {
    return "Você não pode mexer neste plano: resolver é do responsável ou da gestão, e descartar é só da gestão.";
  }
  return mensagemErroGarante(mensagem);
}

/** Resposta que originou o plano, em texto curto (com a meta, quando tem). */
export function textoRespostaOrigem(
  item: { tipo: TipoItemGarante; meta_min?: number | null; meta_max?: number | null },
  resposta: { valorBool: boolean | null; valorNumero: number | null; valorTexto: string | null } | null,
): string {
  if (!resposta) return "Resposta não encontrada";
  const meta = textoMeta(item.tipo, item.meta_min ?? null, item.meta_max ?? null);
  let valor: string;
  if (item.tipo === "check") valor = resposta.valorBool === null ? "-" : resposta.valorBool ? "Feito" : "Não feito";
  else if (item.tipo === "estrelas") valor = resposta.valorNumero === null ? "-" : `${resposta.valorNumero} estrelas`;
  else if (item.tipo === "numero") valor = resposta.valorNumero === null ? "-" : String(resposta.valorNumero).replace(".", ",");
  else valor = resposta.valorTexto ?? "-";
  return meta ? `${valor} (${meta})` : valor;
}

/** Checklists de hoje atrasados: passaram do horário limite sem concluir
 * (mesma regra do cartão da agenda). */
export function contarAtrasados(linhas: { situacao: SituacaoAgenda; prazo: string }[], agora: Date): number {
  return linhas.filter((l) => situacaoNaTela(l.situacao, l.prazo, agora) === "atrasada").length;
}

/** Planos abertos por página na tela de planos (e teto dos fechados mostrados). */
export const PLANOS_POR_PAGINA = 100;

/** `?pagina=N` da URL: inteiro de 1 a 10.000; qualquer outra coisa vira 1. */
export function lerPagina(valor: string | string[] | undefined): number {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Página pedida limitada ao total (página além da última vira a última) e as
 * posições `de`/`ate` para o `.range()` do Supabase (inclusivas). Sem nenhum
 * plano, continua página 1 de 1. */
export function calcularPaginacao(
  total: number,
  pedida: number,
  porPagina: number = PLANOS_POR_PAGINA,
): { pagina: number; totalPaginas: number; de: number; ate: number } {
  const totalPaginas = Math.max(1, Math.ceil(Math.max(0, total) / porPagina));
  const pagina = Math.min(Math.max(1, Math.floor(pedida) || 1), totalPaginas);
  const de = (pagina - 1) * porPagina;
  return { pagina, totalPaginas, de, ate: de + porPagina - 1 };
}

/** Textos do ícone (i) da tela de planos e do card do Painel. */
export const DICA_PLANOS = {
  origem:
    "O plano nasce sozinho: um para cada item fora da meta quando o checklist é concluído, e um para cada item crítico fora da meta quando o checklist passa do fim da janela (fim do dia, ou a tolerância de atraso que a gestão definiu) sem ser concluído.",
  prazo:
    "Prazo = hora da conclusão (ou do fim da janela, quando o checklist não foi concluído) + o prazo do plano de ação da regra da unidade naquela data. Atrasado = aberto depois do prazo.",
  responsavel:
    "Responsável = quem é responsável pela programação do checklist. Programação sem responsável deixa o plano com a gestão da unidade.",
  abertos: "Planos de ação ainda abertos (no prazo + atrasados) que você pode ver.",
  atrasados: "Planos de ação abertos com o prazo já vencido.",
} as const;

export const DICA_CARD_GARANTE = {
  nota:
    "Nota dos últimos 7 dias (contando hoje) = (P + E + Q) ÷ 3, igual à tela Nota. Conta só checklist fechado: concluído, ou com a janela vencida (fim do dia, ou a tolerância de atraso que a gestão definiu). Sem nenhum fechado, mostra \"-\".",
  atrasados: "Checklists de hoje que passaram do horário limite sem ser concluídos.",
  criticos:
    "Respostas fora da meta em itens críticos nos checklists dos últimos 7 dias (contando hoje), concluídos ou não.",
  planos: "Planos de ação ainda abertos na unidade (no prazo + atrasados).",
} as const;
