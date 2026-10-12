import { unstable_isUnrecognizedActionError } from "next/navigation";

/** Texto para quando a chamada ao servidor falha porque o app foi atualizado
 * com a tela aberta: a aba guarda referências da versão anterior, que o
 * servidor novo não reconhece mais. Recarregar resolve. */
export const MENSAGEM_APP_ATUALIZADO_GUARDADO =
  "O app foi atualizado. Seus números estão guardados: recarregue a página (F5) e envie de novo.";
export const MENSAGEM_APP_ATUALIZADO =
  "O app foi atualizado. Recarregue a página (F5) e tente de novo.";

/** Mensagem para o catch de uma Server Action chamada pelo navegador.
 * `guardado`: a tela tem rascunho salvo, então dá pra dizer que nada se perde. */
export function mensagemFalhaChamada(
  erro: unknown,
  fallback: string,
  { guardado = false }: { guardado?: boolean } = {},
): string {
  if (unstable_isUnrecognizedActionError(erro)) {
    return guardado ? MENSAGEM_APP_ATUALIZADO_GUARDADO : MENSAGEM_APP_ATUALIZADO;
  }
  return fallback;
}
