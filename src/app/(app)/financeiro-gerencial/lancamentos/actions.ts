"use server";

import { requireFinanceiroGerencial, requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import {
  criarLancamento,
  criarRecorrencia,
  editarLancamento,
  editarRecorrencia,
  estornarBaixa,
  excluirLancamento,
  listarBaixasDaParcela,
  obterRecorrenciaParaEdicao,
  registrarBaixa,
} from "@/lib/banco/financeiro-gerencial";
import { competenciasFechadas } from "@/lib/banco/financeiro-gerencial-v1";
import { ErroPublico } from "@/lib/erros";
import {
  baixaFinanceiraEntradaSchema,
  editarLancamentoFinanceiroEntradaSchema,
  editarRecorrenciaEntradaSchema,
  estornarBaixaEntradaSchema,
  excluirLancamentoEntradaSchema,
  lancamentoFinanceiroEntradaSchema,
  listarBaixasParcelaEntradaSchema,
  obterRecorrenciaEntradaSchema,
  recorrenciaFinanceiraEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { revalidatePath } from "next/cache";
import type { Baixa, Lancamento, Parcela, Recorrencia } from "@/lib/financeiro-gerencial/tipos";
import type { AcessoAtual } from "@/lib/acesso";
import type { OcorrenciaRecorrencia, PlanoEdicaoRecorrencia } from "@/lib/financeiro-gerencial/recorrencia";

/** Mês fechado barra o Operacional (a barreira real é o gatilho
 * `bloquear_periodo_fechado_financeiro`; aqui só falha antes, com mensagem
 * clara, e evita lançamento gravado sem parcela). */
async function garantirMesesAbertos(acesso: AcessoAtual, datas: string[]): Promise<void> {
  if (acesso.role !== "operacional") return;
  const fechadas = await competenciasFechadas(acesso.unidadeId);
  const bloqueada = datas.map((d) => d.slice(0, 7)).find((c) => fechadas.has(c));
  if (bloqueada) {
    const [ano, mes] = bloqueada.split("-");
    throw new ErroPublico(`O mês ${mes}/${ano} está fechado. Só Gestão/master altera lançamentos desse período.`);
  }
}

// Sem `registrarAuditoria()` aqui - o gatilho `auditar_escrita_financeiro_gerencial`
// (migração `20260824090000_...sql`) grava o log direto no banco pra
// qualquer INSERT em `fin_lancamentos`/`fin_parcelas`/`fin_baixas`/`fin_recorrencias`,
// e o UPDATE de status disparado por `recalcular_parcela_apos_baixa` também é
// logado automaticamente.
export type ResultadoLancamento = { ok: true; lancamento: Lancamento } | { ok: false; mensagem: string };
export type ResultadoBaixa = { ok: true; parcela: Parcela } | { ok: false; mensagem: string };
export type ResultadoRecorrencia =
  | { ok: true; recorrencia: Recorrencia; ocorrenciasGeradas: number }
  | { ok: false; mensagem: string };
export type ResultadoExclusao = { ok: true } | { ok: false; mensagem: string };

function revalidarLancamentos() {
  revalidatePath("/financeiro-gerencial/lancamentos/receitas");
  revalidatePath("/financeiro-gerencial/lancamentos/despesas");
}

export async function criarLancamentoAction(input: unknown): Promise<ResultadoLancamento> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const entrada = validarEntrada(lancamentoFinanceiroEntradaSchema, input);
    await garantirMesesAbertos(acesso, [entrada.dataCompetencia, ...entrada.parcelas.map((p) => p.dataPrevista)]);
    const lancamento = await criarLancamento({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidarLancamentos();
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar o lançamento.") };
  }
}

// Não exige conta financeira (item 6: recorrência não pede conta na
// criação, só na baixa de cada ocorrência gerada, igual lançamento comum).
export async function criarRecorrenciaAction(input: unknown): Promise<ResultadoRecorrencia> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_recorrencia_criar");
    const entrada = validarEntrada(recorrenciaFinanceiraEntradaSchema, input);
    await garantirMesesAbertos(acesso, [entrada.dataInicio, ...(entrada.dataCompetencia ? [entrada.dataCompetencia] : [])]);
    const { recorrencia, ocorrenciasGeradas } = await criarRecorrencia({
      ...entrada,
      unidadeId: acesso.unidadeId,
      criadoPor: acesso.userId,
    });
    revalidarLancamentos();
    return { ok: true, recorrencia, ocorrenciasGeradas };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a recorrência.") };
  }
}

// Só Gestão/master (a RLS `fin_lancamentos_update_gestao` é a barreira real) -
// não mexe em parcela nenhuma, só nos campos do lançamento em si.
export async function editarLancamentoAction(input: unknown): Promise<ResultadoLancamento> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_editar");
    const entrada = validarEntrada(editarLancamentoFinanceiroEntradaSchema, input);
    const lancamento = await editarLancamento({ ...entrada, unidadeId: acesso.unidadeId });
    revalidarLancamentos();
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar o lançamento.") };
  }
}

// Excluir só enquanto sem baixa (trigger `impedir_exclusao_lancamento_com_baixa`
// é a barreira real) e só Gestão/master (RLS `fin_lancamentos_delete_gestao`).
export async function excluirLancamentoAction(input: unknown): Promise<ResultadoExclusao> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_excluir");
    const entrada = validarEntrada(excluirLancamentoEntradaSchema, input);
    await excluirLancamento({ ...entrada, unidadeId: acesso.unidadeId });
    revalidarLancamentos();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir o lançamento.") };
  }
}

export async function registrarBaixaAction(input: unknown): Promise<ResultadoBaixa> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_baixa_registrar");
    const entrada = validarEntrada(baixaFinanceiraEntradaSchema, input);
    await garantirMesesAbertos(acesso, [entrada.data]);
    const parcela = await registrarBaixa({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidarLancamentos();
    return { ok: true, parcela };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível registrar a baixa.") };
  }
}

// Correção de baixa errada - restrito a Gestão/master (o gatilho
// `proteger_baixa_financeira` é a barreira real; `requireGestaoFinanceiroGerencial`
// aqui é só pra falhar cedo, sem gastar rate limit numa tentativa de
// Operacional que o banco ia rejeitar de qualquer jeito).
export async function registrarEstornoBaixaAction(input: unknown): Promise<ResultadoBaixa> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_baixa_estornar");
    const entrada = validarEntrada(estornarBaixaEntradaSchema, input);
    const parcela = await estornarBaixa({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidarLancamentos();
    return { ok: true, parcela };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível estornar a baixa.") };
  }
}

export type ResultadoListarBaixas = { ok: true; baixas: Baixa[] } | { ok: false; mensagem: string };

// Modal "Baixas desta parcela" (estorno) - leitura, qualquer perfil do módulo.
export async function listarBaixasDaParcelaAction(input: unknown): Promise<ResultadoListarBaixas> {
  const acesso = await requireFinanceiroGerencial();
  try {
    const entrada = validarEntrada(listarBaixasParcelaEntradaSchema, input);
    const baixas = await listarBaixasDaParcela(acesso.unidadeId, entrada.parcelaId);
    return { ok: true, baixas };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível carregar as baixas.") };
  }
}

// ── Editar pagamento recorrente (25/09) ────────────────────────────────────
// Só Gestão/master, igual editar lançamento (`requireGestaoFinanceiroGerencial`
// já inclui master; RLS de update e o gatilho de parcela são a barreira real).

export type ResultadoObterRecorrencia =
  | { ok: true; recorrencia: Recorrencia; ocorrencias: OcorrenciaRecorrencia[] }
  | { ok: false; mensagem: string };
export type ResultadoEditarRecorrencia = { ok: true; plano: PlanoEdicaoRecorrencia } | { ok: false; mensagem: string };

export async function obterRecorrenciaParaEdicaoAction(input: unknown): Promise<ResultadoObterRecorrencia> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    const entrada = validarEntrada(obterRecorrenciaEntradaSchema, input);
    const { recorrencia, ocorrencias } = await obterRecorrenciaParaEdicao(acesso.unidadeId, entrada.recorrenciaId);
    return { ok: true, recorrencia, ocorrencias };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível carregar a recorrência.") };
  }
}

export async function editarRecorrenciaAction(input: unknown): Promise<ResultadoEditarRecorrencia> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_editar");
    const { recorrenciaId, ...modelo } = validarEntrada(editarRecorrenciaEntradaSchema, input);
    const plano = await editarRecorrencia({ unidadeId: acesso.unidadeId, recorrenciaId, modelo, criadoPor: acesso.userId });
    revalidarLancamentos();
    revalidatePath("/financeiro-gerencial/recorrencias");
    return { ok: true, plano };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar a recorrência.") };
  }
}
