"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireEscritorio } from "@/lib/acesso";
import * as banco from "@/lib/banco/comercial";
import { pareceCredencial } from "@/lib/clientes/jornada";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { acaoLeadSchema, validarEntrada } from "@/lib/validacao";

export type ResultadoComercial = { ok: true } | { ok: false; mensagem: string };

/** Uma ação só para a ficha do lead: mover etapa, perdido com motivo, próxima
 * ação, nota e "Virou cliente". Barreira de master, limite, RPC (grava a
 * mudança e o evento juntos), auditoria e revalidação. */
export async function acaoLeadAction(input: unknown): Promise<ResultadoComercial> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("comercial_salvar");
    const e = validarEntrada(acaoLeadSchema, input);
    const dados: Record<string, unknown> = {};
    if (e.acao === "etapa") dados.para_etapa = e.paraEtapa;
    if (e.acao === "perdido") dados.texto = e.motivo;
    if (e.acao === "proxima_acao") Object.assign(dados, { texto: e.texto, data: e.data });
    if (e.acao === "nota") dados.texto = e.texto;
    if (e.acao === "virou_cliente") dados.organizacao_id = e.organizacaoId;
    if (typeof dados.texto === "string" && pareceCredencial(dados.texto)) {
      throw new ErroPublico("Não guarde senha, token, chave ou dado bancário aqui.");
    }
    const eventoId = await banco.atualizarLead(e.leadId, e.acao, dados);
    await registrarAuditoria({ acesso, acao: e.acao, entidade: "lead", entidadeId: e.leadId, dadosNovos: { ...dados, eventoId } });
    revalidatePath("/escritorio/comercial");
    revalidatePath(`/escritorio/comercial/${e.leadId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar.") };
  }
}
