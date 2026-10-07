"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireEscritorio } from "@/lib/acesso";
import * as banco from "@/lib/banco/comercial";
import { pareceCredencial } from "@/lib/clientes/jornada";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { instagramValido, normalizarInstagram } from "@/lib/comercial/funil";
import { acaoLeadSchema, novoLeadSchema, validarEntrada } from "@/lib/validacao";

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

/** Novo lead (prospecção ativa): basta o @ do Instagram ou o WhatsApp. Entra
 * em "Mandar primeira mensagem" com o evento `criado` na linha do tempo. */
export async function criarLeadAction(input: unknown): Promise<ResultadoComercial> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("comercial_salvar");
    const bruto = input as { instagram?: unknown; whatsapp?: unknown } | null;
    if (!String(bruto?.instagram ?? "").trim() && !String(bruto?.whatsapp ?? "").trim()) {
      throw new ErroPublico("Informe o Instagram ou o WhatsApp.");
    }
    const e = validarEntrada(novoLeadSchema, input);
    const instagram = normalizarInstagram(e.instagram);
    if (instagram && !instagramValido(instagram)) throw new ErroPublico("Instagram inválido. Use só o @ do perfil.");
    const dados = {
      nome: e.nome,
      negocio: e.negocio,
      instagram,
      whatsapp: e.whatsapp,
      origem: e.origem,
      cidade_bairro: e.cidadeBairro,
      seguidores: e.seguidores,
      ultimo_post_em: e.ultimoPostEm,
      nota_google: e.notaGoogle,
      avaliacoes_google: e.avaliacoesGoogle,
      vende_delivery: e.vendeDelivery,
    };
    if ([e.nome, e.negocio, e.cidadeBairro].some(pareceCredencial)) {
      throw new ErroPublico("Não guarde senha, token, chave ou dado bancário aqui.");
    }
    const leadId = await banco.criarLead(dados);
    await registrarAuditoria({ acesso, acao: "criar", entidade: "lead", entidadeId: leadId, dadosNovos: dados });
    revalidatePath("/escritorio/comercial");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível cadastrar o lead.") };
  }
}
