"use server";

import { revalidatePath } from "next/cache";
import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { salvarFechamento } from "@/lib/banco/financeiro-gerencial-v1";
import { mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { fechamentoMensalEntradaSchema, validarEntrada } from "@/lib/validacao";

export type ResultadoFechamento = { ok: true } | { ok: false; mensagem: string };

// Fechar = um clique; reabrir exige motivo (schema + check da tabela). Quem e
// quando ficam em `logs_auditoria` pelo gatilho de auditoria.
export async function salvarFechamentoAction(input: unknown): Promise<ResultadoFechamento> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_fechamento_salvar");
    const entrada = validarEntrada(fechamentoMensalEntradaSchema, input);
    await salvarFechamento({ ...entrada, unidadeId: acesso.unidadeId, atualizadoPor: acesso.userId });
    revalidatePath("/financeiro-gerencial/fechamento");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o fechamento.") };
  }
}
