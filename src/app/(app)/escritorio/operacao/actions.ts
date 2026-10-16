"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireEscritorio } from "@/lib/acesso";
import { pareceCredencial } from "@/lib/clientes/jornada";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { acaoOperacaoSchema, tarefaOperacaoSchema, validarEntradaOperacao } from "@/lib/operacao/validacao";
import { enviarAcaoOperacao, enviarEstadoTarefa } from "@/lib/operacao/vini";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";

export type ResultadoOperacao = { ok: true } | { ok: false; mensagem: string };

/** Ação num cartão do quadro (mover, nota, aprovar, recusar, enviar texto,
 * resolver, não é demanda). O Vini é quem grava e quem envia ao cliente; o Hub
 * só pede. Barreira de master, limite (mesmo balde do Comercial, que já existe
 * no banco), validação estrita, auditoria e revalidação. */
export async function acaoOperacaoAction(input: unknown): Promise<ResultadoOperacao> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("comercial_salvar");
    const e = validarEntradaOperacao(acaoOperacaoSchema, input);
    // Só a nota fica guardada como anotação; texto ao cliente pode citar uma chave Pix de verdade.
    if (e.acao === "nota" && e.texto && pareceCredencial(e.texto)) {
      throw new ErroPublico("Não guarde senha, token, chave ou dado bancário aqui.");
    }
    const r = await enviarAcaoOperacao(e);
    if (!r.ok) return r;
    await registrarAuditoria({
      acesso,
      acao: `operacao_${e.acao}`,
      entidade: "operacao_item",
      entidadeId: e.chave,
      dadosNovos: { coluna: e.coluna ?? null, comTexto: Boolean(e.texto) },
    });
    revalidatePath("/escritorio/operacao");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar.") };
  }
}

/** Estado de uma tarefa de ata (A fazer, Fazendo, Feito), guardado no Vini. */
export async function estadoTarefaOperacaoAction(input: unknown): Promise<ResultadoOperacao> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("comercial_salvar");
    const e = validarEntradaOperacao(tarefaOperacaoSchema, input);
    const r = await enviarEstadoTarefa(e);
    if (!r.ok) return r;
    await registrarAuditoria({ acesso, acao: "operacao_tarefa_estado", entidade: "operacao_tarefa", entidadeId: e.id, dadosNovos: { estado: e.estado } });
    revalidatePath("/escritorio/operacao");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar.") };
  }
}
