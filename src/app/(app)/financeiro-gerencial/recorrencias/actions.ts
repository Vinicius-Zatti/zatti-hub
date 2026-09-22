"use server";

import { revalidatePath } from "next/cache";
import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { encerrarRecorrencia } from "@/lib/banco/financeiro-gerencial-v1";
import { mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { encerrarRecorrenciaEntradaSchema, validarEntrada } from "@/lib/validacao";

export type ResultadoEncerrarRecorrencia = { ok: true; excluidas: number } | { ok: false; mensagem: string };

// Gestão/master: some com as ocorrências futuras ainda sem baixa, mantém o
// resto (RLS de update/delete + gatilho de exclusão com baixa são a barreira).
export async function encerrarRecorrenciaAction(input: unknown): Promise<ResultadoEncerrarRecorrencia> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_recorrencia_encerrar");
    const entrada = validarEntrada(encerrarRecorrenciaEntradaSchema, input);
    const { excluidas } = await encerrarRecorrencia({ ...entrada, unidadeId: acesso.unidadeId });
    revalidatePath("/financeiro-gerencial/recorrencias");
    revalidatePath("/financeiro-gerencial/lancamentos/receitas");
    revalidatePath("/financeiro-gerencial/lancamentos/despesas");
    return { ok: true, excluidas };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível encerrar a recorrência.") };
  }
}
