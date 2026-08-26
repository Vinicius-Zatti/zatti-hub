"use server";

import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { salvarEstoqueMensal } from "@/lib/banco/financeiro-gerencial";
import { estoqueMensalEntradaSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { revalidatePath } from "next/cache";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";

// Sem `registrarAuditoria()` aqui - o gatilho `auditar_escrita_financeiro_gerencial`
// (migração `20260825170000_...sql`) grava o log direto no banco pra
// qualquer INSERT/UPDATE em `fin_estoque_mensal`.
export type ResultadoEstoqueMensal = { ok: true; estoque: EstoqueMensal } | { ok: false; mensagem: string };

export async function salvarEstoqueMensalAction(input: unknown): Promise<ResultadoEstoqueMensal> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_estoque_mensal_salvar");
    const entrada = validarEntrada(estoqueMensalEntradaSchema, input);
    const estoque = await salvarEstoqueMensal({
      unidadeId: acesso.unidadeId,
      competencia: `${entrada.competencia}-01`,
      estoqueInicialMercadorias: entrada.estoqueInicialMercadorias,
      estoqueInicialEmbalagens: entrada.estoqueInicialEmbalagens,
      estoqueFinalMercadorias: entrada.estoqueFinalMercadorias,
      estoqueFinalEmbalagens: entrada.estoqueFinalEmbalagens,
      criadoPor: acesso.userId,
    });
    revalidatePath("/financeiro-gerencial/estoque");
    revalidatePath("/financeiro-gerencial/dre");
    return { ok: true, estoque };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o estoque mensal.") };
  }
}
