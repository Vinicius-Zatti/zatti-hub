"use server";

import { revalidatePath } from "next/cache";
import { requireAgenda } from "@/lib/acesso";
import {
  criarTarefaAgenda,
  editarTarefaAgenda,
  excluirTarefaAgenda,
  marcarExecucaoRotina,
  marcarSituacaoTarefa,
} from "@/lib/banco/agenda";
import { mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import {
  editarTarefaAgendaEntradaSchema,
  execucaoRotinaAgendaEntradaSchema,
  idTarefaAgendaEntradaSchema,
  situacaoTarefaAgendaEntradaSchema,
  tarefaAgendaEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";

export type ResultadoAgenda = { ok: true } | { ok: false; mensagem: string };

export async function criarTarefaAction(input: unknown): Promise<ResultadoAgenda> {
  const acesso = await requireAgenda();
  try {
    await exigirLimiteRequisicao("agenda_tarefa_salvar");
    const entrada = validarEntrada(tarefaAgendaEntradaSchema, input);
    await criarTarefaAgenda(acesso.userId, entrada);
    revalidatePath("/agenda/dia");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a tarefa.") };
  }
}

export async function editarTarefaAction(input: unknown): Promise<ResultadoAgenda> {
  const acesso = await requireAgenda();
  try {
    await exigirLimiteRequisicao("agenda_tarefa_salvar");
    const { id, ...entrada } = validarEntrada(editarTarefaAgendaEntradaSchema, input);
    await editarTarefaAgenda(acesso.userId, id, entrada);
    revalidatePath("/agenda/dia");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a tarefa.") };
  }
}

export async function marcarTarefaAction(input: unknown): Promise<ResultadoAgenda> {
  const acesso = await requireAgenda();
  try {
    await exigirLimiteRequisicao("agenda_marcar_execucao");
    const entrada = validarEntrada(situacaoTarefaAgendaEntradaSchema, input);
    await marcarSituacaoTarefa(acesso.userId, entrada.id, entrada.situacao);
    revalidatePath("/agenda/dia");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível marcar a tarefa.") };
  }
}

export async function excluirTarefaAction(input: unknown): Promise<ResultadoAgenda> {
  const acesso = await requireAgenda();
  try {
    await exigirLimiteRequisicao("agenda_tarefa_excluir");
    const entrada = validarEntrada(idTarefaAgendaEntradaSchema, input);
    await excluirTarefaAgenda(acesso.userId, entrada.id);
    revalidatePath("/agenda/dia");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir a tarefa.") };
  }
}

export async function marcarRotinaAction(input: unknown): Promise<ResultadoAgenda> {
  const acesso = await requireAgenda();
  try {
    await exigirLimiteRequisicao("agenda_marcar_execucao");
    const entrada = validarEntrada(execucaoRotinaAgendaEntradaSchema, input);
    await marcarExecucaoRotina(acesso.userId, entrada.data, entrada.rotinaId, entrada.situacao);
    revalidatePath("/agenda/dia");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível marcar a rotina.") };
  }
}
