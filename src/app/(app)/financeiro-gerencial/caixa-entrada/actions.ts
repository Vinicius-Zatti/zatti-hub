"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceiroGerencial, requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { configurarAlerta, configurarCaixa, lancarEntrada, linkDoOriginal, tratarEntrada } from "@/lib/banco/caixa-entrada";
import { lerEntrada, receberArquivo, TAMANHO_MAXIMO_CAIXA } from "@/lib/caixa-entrada/processar";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { documentoFinanceiroEntradaSchema, validarEntrada } from "@/lib/validacao";

// Caixa de Entrada (Financeiro V2, 11/10/2026). Limites reaproveitam chaves do Financeiro.

const CAMINHO = "/financeiro-gerencial/caixa-entrada";
const uuid = z.string().uuid();
type Resposta = { ok: true; mensagem: string } | { ok: false; mensagem: string };

export async function enviarArquivosAction(formData: FormData): Promise<Resposta> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_importar");
    const arquivos = formData.getAll("arquivos").filter((a): a is File => a instanceof File && a.size > 0);
    if (arquivos.length === 0) throw new ErroPublico("Escolha pelo menos um arquivo.");
    if (arquivos.length > 20) throw new ErroPublico("Envie no máximo 20 arquivos por vez.");
    let novos = 0;
    let repetidos = 0;
    for (const arquivo of arquivos) {
      if (arquivo.size > TAMANHO_MAXIMO_CAIXA) throw new ErroPublico(`${arquivo.name} passa de 10 MB.`);
      const r = await receberArquivo({
        unidadeId: acesso.unidadeId,
        canal: "upload",
        remetente: acesso.usuarioNome ?? acesso.usuarioEmail,
        nomeArquivo: arquivo.name,
        bytes: new Uint8Array(await arquivo.arrayBuffer()),
        criadoPor: acesso.userId,
      });
      if (r.novo) novos++;
      else repetidos++;
      if (r.novo || r.situacao === "recebido") after(() => lerEntrada(r.id, acesso.userId).catch(() => undefined));
    }
    revalidatePath(CAMINHO);
    const partes = [`${novos} documento${novos === 1 ? "" : "s"} recebido${novos === 1 ? "" : "s"}, lendo agora`];
    if (repetidos) partes.push(`${repetidos} já estava${repetidos === 1 ? "" : "m"} na Caixa de Entrada`);
    return { ok: true, mensagem: `${partes.join("; ")}.` };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível receber os arquivos.") };
  }
}

export async function lerDeNovoAction(entradaId: string): Promise<Resposta> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_reprocessar");
    const id = uuid.parse(entradaId);
    // A entrada precisa ser visível pela sessão (RLS) antes de o servidor ler com o service role.
    await linkDoOriginal(acesso.unidadeId, id);
    const r = await lerEntrada(id, acesso.userId);
    revalidatePath(CAMINHO);
    if (r === "ocupado") return { ok: false, mensagem: "Este documento já está sendo lido ou passou do limite de tentativas." };
    return r === "lido" ? { ok: true, mensagem: "Documento lido." } : { ok: false, mensagem: "Não consegui ler este documento. Lance à mão pelo formulário." };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível ler o documento.") };
  }
}

export async function linkOriginalAction(entradaId: string): Promise<{ ok: true; url: string } | { ok: false; mensagem: string }> {
  const acesso = await requireFinanceiroGerencial();
  try {
    return { ok: true, url: await linkDoOriginal(acesso.unidadeId, uuid.parse(entradaId)) };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível abrir o arquivo.") };
  }
}

export async function lancarEntradaAction(input: unknown): Promise<{ ok: true; documentoId: string } | { ok: false; mensagem: string }> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const bruto = z.object({ entradaId: uuid, documento: z.unknown() }).strict().parse(input);
    const documento = validarEntrada(documentoFinanceiroEntradaSchema, bruto.documento);
    const documentoId = await lancarEntrada(bruto.entradaId, { ...documento, unidadeId: acesso.unidadeId, origem: "caixa_entrada" });
    revalidatePath(CAMINHO);
    revalidatePath("/financeiro-gerencial/contas-pagar-receber");
    return { ok: true, documentoId };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível lançar o documento.") };
  }
}

export async function anexarEntradaAction(input: unknown): Promise<Resposta> {
  await requireFinanceiroGerencial();
  try {
    const e = z.object({ entradaId: uuid, lancamentoId: uuid }).strict().parse(input);
    await tratarEntrada(e.entradaId, "anexar", e.lancamentoId, null);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "Documento anexado ao lançamento." };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível anexar.") };
  }
}

export async function descartarEntradaAction(input: unknown): Promise<Resposta> {
  await requireFinanceiroGerencial();
  try {
    const e = z.object({ entradaId: uuid, motivo: z.string().trim().min(3).max(300) }).strict().parse(input);
    await tratarEntrada(e.entradaId, "descartar", null, e.motivo);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "Documento descartado." };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível descartar.") };
  }
}

const configSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("adicionar_remetente"), telefone: z.string().regex(/^[\d\s()+-]{10,20}$/), nome: z.string().trim().min(1).max(80) }).strict(),
  z.object({ acao: z.literal("remover_remetente"), id: uuid }).strict(),
  z.object({ acao: z.literal("adicionar_email"), email: z.string().trim().toLowerCase().email().max(120), nome: z.string().trim().min(1).max(80) }).strict(),
  z.object({ acao: z.literal("remover_email"), id: uuid }).strict(),
  z.object({ acao: z.literal("solicitar_pasta"), email: z.union([z.literal(""), z.string().email().max(120)]) }).strict(),
  z.object({ acao: z.literal("desligar_pasta") }).strict(),
]);

export async function configurarCaixaAction(input: unknown): Promise<Resposta> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_conta_financeira_salvar");
    const config = configSchema.parse(input);
    await configurarCaixa(acesso.unidadeId, config);
    revalidatePath(CAMINHO);
    const mensagens: Record<string, string> = {
      adicionar_remetente: "Número cadastrado. Notas enviadas por ele no WhatsApp caem aqui.",
      remover_remetente: "Número removido.",
      adicionar_email: "E-mail autorizado. Notas encaminhadas por ele caem aqui.",
      remover_email: "E-mail removido.",
      solicitar_pasta: "Pasta pedida. Em até 15 minutos o link aparece aqui.",
      desligar_pasta: "Leitura da pasta desligada.",
    };
    return { ok: true, mensagem: mensagens[config.acao] };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível salvar a configuração.") };
  }
}

const alertaSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("adicionar"), telefone: z.string().regex(/^[\d\s()+-]{10,20}$/), nome: z.string().trim().min(1).max(80) }).strict(),
  z.object({ acao: z.literal("remover"), id: uuid }).strict(),
]);

/** Quem recebe o alerta diário de contas a pagar no WhatsApp (Gestão/master). */
export async function configurarAlertaAction(input: unknown): Promise<Resposta> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_conta_financeira_salvar");
    const config = alertaSchema.parse(input);
    await configurarAlerta(acesso.unidadeId, config);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: config.acao === "adicionar" ? "Pronto. O alerta das 8h vai para este número." : "Número removido do alerta." };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível salvar o alerta.") };
  }
}
