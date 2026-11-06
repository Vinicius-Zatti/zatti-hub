"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireEscritorio } from "@/lib/acesso";
import { pareceCredencial } from "@/lib/clientes/jornada";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { automacaoInstagramSchema, palavraInstagramSchema } from "@/lib/instagram/validacao";
import { enviarAutomacaoInstagram, enviarPalavraInstagram } from "@/lib/instagram/vini";
import { validarEntradaOperacao } from "@/lib/operacao/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";

export type ResultadoInstagram = { ok: true } | { ok: false; mensagem: string };

/** Liga ou desliga o Direct automático de um post. O Vini grava; o Hub só pede.
 * Barreira de master, limite (mesmo balde da Operação), validação estrita e auditoria. */
export async function palavraInstagramAction(input: unknown): Promise<ResultadoInstagram> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("comercial_salvar");
    const e = validarEntradaOperacao(palavraInstagramSchema, input);
    const r = await enviarPalavraInstagram(e);
    if (!r.ok) return r;
    await registrarAuditoria({ acesso, acao: "instagram_palavra", entidade: "instagram_post", entidadeId: e.codigo, dadosNovos: { ativa: e.ativa } });
    revalidatePath("/escritorio/instagram");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar.") };
  }
}

/** Automação nova escrita por Vinícius no Hub: o texto dele já é o aprovado. */
export async function automacaoInstagramAction(input: unknown): Promise<ResultadoInstagram> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("comercial_salvar");
    const e = validarEntradaOperacao(automacaoInstagramSchema, input);
    if (pareceCredencial(e.direct)) throw new ErroPublico("Não coloque senha, token ou dado bancário no Direct.");
    const r = await enviarAutomacaoInstagram(e);
    if (!r.ok) return r;
    await registrarAuditoria({
      acesso,
      acao: "instagram_automacao_criar",
      entidade: "instagram_post",
      entidadeId: e.link,
      dadosNovos: { palavra: e.palavra, comLinkEntrega: Boolean(e.linkEntrega) },
    });
    revalidatePath("/escritorio/instagram");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar.") };
  }
}
