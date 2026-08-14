"use server";

import { getAcessoAtual } from "@/lib/acesso";
import { atualizarRecebimento } from "@/lib/pedidos";
import { revalidatePath } from "next/cache";
import { recebimentoSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";

/** Só toca recebimento (quantidade recebida, observação, marcar recebido) -
 * nunca preço nem quantidade pedida, então serve tanto pra Gestão quanto
 * pro Operacional sem precisar de checagem extra de papel aqui: a própria
 * função `atualizarRecebimento` já não sabe editar mais nada além disso. */
export async function marcarRecebidoAction(input: {
  pedidoId: string;
  recebido: boolean;
  observacaoEntrega: string | null;
  itensRecebidos: { sku: string; quantidadeRecebida: number | null }[];
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await getAcessoAtual();

  try {
    await exigirLimiteRequisicao("recebimento");
    const entrada = validarEntrada(recebimentoSchema, input);
    await atualizarRecebimento({ ...entrada, unidadeId: acesso.unidadeId });
    revalidatePath("/estoque/pedidos/feitos");
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel atualizar o recebimento.") };
  }
}
