"use server";

import { revalidatePath } from "next/cache";
import { requireMeuTempo } from "@/lib/acesso";
import {
  criarLancamentoManualTempo,
  encerrarCronometroTempo,
  iniciarCronometroTempo,
  pausarCronometroTempo,
  retomarCronometroTempo,
} from "@/lib/banco/meu-tempo";
import { mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import {
  idLancamentoTempoEntradaSchema,
  iniciarCronometroTempoEntradaSchema,
  lancamentoTempoManualEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";
import type { LancamentoTempo } from "@/lib/meu-tempo/tipos";

export type ResultadoLancamentoTempo = { ok: true; lancamento: LancamentoTempo } | { ok: false; mensagem: string };

export async function iniciarCronometroAction(input: unknown): Promise<ResultadoLancamentoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_cronometro_acao");
    const entrada = validarEntrada(iniciarCronometroTempoEntradaSchema, input);
    const lancamento = await iniciarCronometroTempo({ userId: acesso.userId, frenteId: entrada.frenteId });
    revalidatePath("/meu-tempo/hoje");
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível iniciar o cronômetro.") };
  }
}

export async function pausarCronometroAction(input: unknown): Promise<ResultadoLancamentoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_cronometro_acao");
    const entrada = validarEntrada(idLancamentoTempoEntradaSchema, input);
    const lancamento = await pausarCronometroTempo({ userId: acesso.userId, id: entrada.id });
    revalidatePath("/meu-tempo/hoje");
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível pausar o cronômetro.") };
  }
}

export async function retomarCronometroAction(input: unknown): Promise<ResultadoLancamentoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_cronometro_acao");
    const entrada = validarEntrada(idLancamentoTempoEntradaSchema, input);
    const lancamento = await retomarCronometroTempo({ userId: acesso.userId, id: entrada.id });
    revalidatePath("/meu-tempo/hoje");
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível retomar o cronômetro.") };
  }
}

export async function encerrarCronometroAction(input: unknown): Promise<ResultadoLancamentoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_cronometro_acao");
    const entrada = validarEntrada(idLancamentoTempoEntradaSchema, input);
    const lancamento = await encerrarCronometroTempo({ userId: acesso.userId, id: entrada.id });
    revalidatePath("/meu-tempo/hoje");
    revalidatePath("/meu-tempo/painel");
    revalidatePath("/meu-tempo/historico");
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível encerrar o cronômetro.") };
  }
}

export async function criarLancamentoManualAction(input: unknown): Promise<ResultadoLancamentoTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_lancamento_criar");
    const entrada = validarEntrada(lancamentoTempoManualEntradaSchema, input);
    const lancamento = await criarLancamentoManualTempo({ userId: acesso.userId, ...entrada });
    revalidatePath("/meu-tempo/hoje");
    revalidatePath("/meu-tempo/painel");
    revalidatePath("/meu-tempo/historico");
    return { ok: true, lancamento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o lançamento.") };
  }
}
