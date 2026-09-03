"use server";

import { revalidatePath } from "next/cache";
import { requireMeuTempo } from "@/lib/acesso";
import { criarFrenteTempo, criarMetaMensalTempo, criarValorHoraTempo, editarFrenteTempo } from "@/lib/banco/meu-tempo";
import { mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import {
  editarFrenteTempoEntradaSchema,
  frenteTempoEntradaSchema,
  metaMensalTempoEntradaSchema,
  validarEntrada,
  valorHoraTempoEntradaSchema,
} from "@/lib/validacao";
import type { FrenteTempo, MetaMensalTempo, ValorHoraTempo } from "@/lib/meu-tempo/tipos";

export type ResultadoFrenteTempo = { ok: true; frente: FrenteTempo } | { ok: false; mensagem: string };
export type ResultadoValorHoraTempo = { ok: true; valorHora: ValorHoraTempo } | { ok: false; mensagem: string };
export type ResultadoMetaMensalTempo = { ok: true; meta: MetaMensalTempo } | { ok: false; mensagem: string };

export async function criarFrenteTempoAction(input: unknown): Promise<ResultadoFrenteTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_frente_salvar");
    const entrada = validarEntrada(frenteTempoEntradaSchema, input);
    const frente = await criarFrenteTempo({ userId: acesso.userId, ...entrada });
    revalidatePath("/meu-tempo/configuracoes");
    revalidatePath("/meu-tempo/hoje");
    return { ok: true, frente };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a frente.") };
  }
}

export async function editarFrenteTempoAction(input: unknown): Promise<ResultadoFrenteTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_frente_salvar");
    const entrada = validarEntrada(editarFrenteTempoEntradaSchema, input);
    const frente = await editarFrenteTempo({ userId: acesso.userId, ...entrada });
    revalidatePath("/meu-tempo/configuracoes");
    revalidatePath("/meu-tempo/hoje");
    revalidatePath("/meu-tempo/painel");
    return { ok: true, frente };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar a frente.") };
  }
}

export async function criarValorHoraTempoAction(input: unknown): Promise<ResultadoValorHoraTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_valor_hora_salvar");
    const entrada = validarEntrada(valorHoraTempoEntradaSchema, input);
    const valorHora = await criarValorHoraTempo({ userId: acesso.userId, ...entrada });
    revalidatePath("/meu-tempo/configuracoes");
    revalidatePath("/meu-tempo/painel");
    return { ok: true, valorHora };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o valor-hora.") };
  }
}

export async function criarMetaMensalTempoAction(input: unknown): Promise<ResultadoMetaMensalTempo> {
  const acesso = await requireMeuTempo();
  try {
    await exigirLimiteRequisicao("tempo_meta_mensal_salvar");
    const entrada = validarEntrada(metaMensalTempoEntradaSchema, input);
    const meta = await criarMetaMensalTempo({ userId: acesso.userId, ...entrada });
    revalidatePath("/meu-tempo/configuracoes");
    revalidatePath("/meu-tempo/painel");
    return { ok: true, meta };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a meta mensal.") };
  }
}
