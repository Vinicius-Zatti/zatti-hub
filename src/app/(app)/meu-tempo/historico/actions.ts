"use server";

import { revalidatePath } from "next/cache";
import { requireMeuTempo } from "@/lib/acesso";
import { editarLancamentoTempo, excluirLancamentoTempo } from "@/lib/banco/meu-tempo";
import { mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { editarLancamentoTempoEntradaSchema, idLancamentoTempoEntradaSchema, validarEntrada } from "@/lib/validacao";
import type { LancamentoTempo } from "@/lib/meu-tempo/tipos";

export type ResultadoLancamentoTempo = { ok: true; lancamento: LancamentoTempo } | { ok: false; mensagem: string };
export type ResultadoExclusaoTempo = { ok: true } | { ok: false; mensagem: string };

export async function editarLancamentoTempoAction(input: unknown): Promise<ResultadoLancamentoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_lancamento_editar");
    const entrada = validarEntrada(editarLancamentoTempoEntradaSchema, input);
    const lancamento = await editarLancamentoTempo({ userId: acesso.userId, ...entrada });
    revalidatePath("/meu-tempo/historico");
    revalidatePath("/meu-tempo/painel");
    revalidatePath("/meu-tempo/hoje");
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar o lançamento.") };
  }
}

export async function excluirLancamentoTempoAction(input: unknown): Promise<ResultadoExclusaoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_lancamento_excluir");
    const entrada = validarEntrada(idLancamentoTempoEntradaSchema, input);
    await excluirLancamentoTempo({ userId: acesso.userId, id: entrada.id });
    revalidatePath("/meu-tempo/historico");
    revalidatePath("/meu-tempo/painel");
    revalidatePath("/meu-tempo/hoje");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir o lançamento.") };
  }
}
