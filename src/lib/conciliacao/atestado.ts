import "server-only";
import { createHmac } from "node:crypto";
import { ErroPublico } from "@/lib/erros";

// Atestado do servidor (A4 do Codex): toda escrita da Conciliação vai ao
// banco como um envelope JSON assinado por HMAC-SHA256. O banco recalcula a
// assinatura sobre o texto exato, confere operação, versão da chave e
// usuário, e só então interpreta o conteúdo. O segredo existe só aqui
// (variável de ambiente) e numa tabela sem grant no banco.

export type EnvelopeAssinado = { envelope: string; atestado: string };

export function assinarEnvelope(operacao: string, usuarioId: string, conteudo: Record<string, unknown>): EnvelopeAssinado {
  const segredo = process.env.CONCILIACAO_ATESTADO_SEGREDO;
  const versao = Number(process.env.CONCILIACAO_ATESTADO_VERSAO ?? "1");
  if (!segredo || segredo.length < 32 || !Number.isInteger(versao) || versao < 1) {
    throw new ErroPublico("A Conciliação ainda não foi configurada neste ambiente. Fale com o suporte da Zatti.");
  }
  const envelope = JSON.stringify({ ...conteudo, op: operacao, kv: versao, usuario: usuarioId });
  const atestado = createHmac("sha256", segredo).update(envelope, "utf8").digest("hex");
  return { envelope, atestado };
}
