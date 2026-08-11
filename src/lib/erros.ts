/** Erro pensado pra chegar até quem está usando o app - a mensagem já
 * nasce segura de mostrar (nunca embute `.message` cru de Postgres, Google
 * Sheets ou qualquer client externo). Toda mensagem de erro hoje devolvida
 * pro navegador nas Server Actions passa a vir só daqui ou do fallback
 * genérico de `paraErroPublico`. */
export class ErroPublico extends Error {}

const MENSAGEM_PADRAO = "Não foi possível concluir a ação agora. Tenta de novo em instantes.";

/** Usar no catch de toda Server Action antes de devolver `{ erro }` pro
 * cliente. Loga o erro real no servidor (nunca no retorno da action - logs
 * não podem virar canal de vazamento) e devolve mensagem genérica, exceto
 * quando o próprio código de negócio lançou um `ErroPublico` de propósito. */
export function paraErroPublico(erro: unknown, contexto: string): string {
  if (erro instanceof ErroPublico) return erro.message;
  console.error(`[${contexto}]`, erro instanceof Error ? erro.message : erro);
  return MENSAGEM_PADRAO;
}
