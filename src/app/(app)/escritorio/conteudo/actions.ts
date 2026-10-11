"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireEscritorio } from "@/lib/acesso";
import * as banco from "@/lib/banco/conteudo";
import { pareceCredencial } from "@/lib/clientes/jornada";
import { validarCamposPeca, type CamposPeca } from "@/lib/conteudo/pecas";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";

export type ResultadoConteudo = { ok: true; id: string } | { ok: false; mensagem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lerEntrada(input: unknown): { id: string | null; versao: number | null; campos: CamposPeca } {
  const o = (input && typeof input === "object" ? input : {}) as { id?: unknown; versao?: unknown; campos?: unknown };
  const id = o.id == null || o.id === "" ? null : String(o.id);
  if (id !== null && !UUID.test(id)) throw new ErroPublico("Peça inválida.");
  const versao = id === null ? null : Number(o.versao);
  if (versao !== null && (!Number.isInteger(versao) || versao < 1)) throw new ErroPublico("Peça inválida.");
  const brutos = o.campos && typeof o.campos === "object" && !Array.isArray(o.campos) ? (o.campos as Record<string, unknown>) : {};
  const v = validarCamposPeca(brutos, id !== null);
  if (!v.ok) throw new ErroPublico(v.erro.charAt(0).toUpperCase() + v.erro.slice(1) + ".");
  const textos = [v.valor.titulo, v.valor.roteiro, v.valor.legenda, v.valor.observacao].filter((t): t is string => !!t);
  if (textos.some(pareceCredencial)) throw new ErroPublico("Não guarde senha, token, chave ou dado bancário aqui.");
  return { id, versao, campos: v.valor };
}

/** Criar ou editar peça (modal) e mudar status no cartão: barreira de master, limite, RPC (grava a
 * mudança e a auditoria juntas, origem hub), log de auditoria do app e revalidação. */
export async function salvarPecaAction(input: unknown): Promise<ResultadoConteudo> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao("conteudo_salvar");
    const { id, versao, campos } = lerEntrada(input);
    const peca = await banco.salvarPeca(id, versao, campos);
    await registrarAuditoria({
      acesso,
      acao: id ? "editar" : "criar",
      entidade: "conteudo_peca",
      entidadeId: peca.id,
      dadosNovos: { ...campos, versao: peca.versao },
    });
    revalidatePath("/escritorio/conteudo");
    return { ok: true, id: peca.id };
  } catch (err) {
    revalidatePath("/escritorio/conteudo");
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a peça.") };
  }
}
