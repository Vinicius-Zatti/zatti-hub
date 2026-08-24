"use server";

import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { criarContaFinanceira, editarContaFinanceira } from "@/lib/banco/financeiro-gerencial";
import { contaFinanceiraEntradaSchema, editarContaFinanceiraEntradaSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { revalidatePath } from "next/cache";
import type { ContaFinanceira } from "@/lib/financeiro-gerencial/tipos";

// Sem `registrarAuditoria()` aqui - o gatilho `auditar_escrita_financeiro_gerencial`
// (migração `20260824090000_...sql`) grava o log direto no banco pra
// qualquer INSERT/UPDATE em `fin_contas_financeiras`.
export type ResultadoContaFinanceira = { ok: true; conta: ContaFinanceira } | { ok: false; mensagem: string };

export async function criarContaFinanceiraAction(input: unknown): Promise<ResultadoContaFinanceira> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_conta_financeira_salvar");
    const entrada = validarEntrada(contaFinanceiraEntradaSchema, input);
    const conta = await criarContaFinanceira({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidatePath("/financeiro-gerencial/contas");
    return { ok: true, conta };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a conta financeira.") };
  }
}

export async function editarContaFinanceiraAction(input: unknown): Promise<ResultadoContaFinanceira> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_conta_financeira_salvar");
    const entrada = validarEntrada(editarContaFinanceiraEntradaSchema, input);
    const conta = await editarContaFinanceira({ ...entrada, unidadeId: acesso.unidadeId });
    revalidatePath("/financeiro-gerencial/contas");
    return { ok: true, conta };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar a conta financeira.") };
  }
}
