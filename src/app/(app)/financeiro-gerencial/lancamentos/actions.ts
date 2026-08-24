"use server";

import { requireFinanceiroGerencial, requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { criarLancamento, estornarBaixa, registrarBaixa } from "@/lib/banco/financeiro-gerencial";
import {
  baixaFinanceiraEntradaSchema,
  estornarBaixaEntradaSchema,
  lancamentoFinanceiroEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { revalidatePath } from "next/cache";
import type { Lancamento, Parcela } from "@/lib/financeiro-gerencial/tipos";

// Sem `registrarAuditoria()` aqui - o gatilho `auditar_escrita_financeiro_gerencial`
// (migração `20260824090000_...sql`) grava o log direto no banco pra
// qualquer INSERT em `fin_lancamentos`/`fin_parcelas`/`fin_baixas`, e o
// UPDATE de status disparado por `recalcular_parcela_apos_baixa` também é
// logado automaticamente.
export type ResultadoLancamento = { ok: true; lancamento: Lancamento } | { ok: false; mensagem: string };
export type ResultadoBaixa = { ok: true; parcela: Parcela } | { ok: false; mensagem: string };

function revalidarLancamentos() {
  revalidatePath("/financeiro-gerencial/lancamentos/receitas");
  revalidatePath("/financeiro-gerencial/lancamentos/despesas");
}

export async function criarLancamentoAction(input: unknown): Promise<ResultadoLancamento> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const entrada = validarEntrada(lancamentoFinanceiroEntradaSchema, input);
    const lancamento = await criarLancamento({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidarLancamentos();
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar o lançamento.") };
  }
}

export async function registrarBaixaAction(input: unknown): Promise<ResultadoBaixa> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_baixa_registrar");
    const entrada = validarEntrada(baixaFinanceiraEntradaSchema, input);
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
