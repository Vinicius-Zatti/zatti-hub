"use server";

import { getAcessoAtual } from "@/lib/acesso";
import { atualizarRecebimento } from "@/lib/pedidos";
import { paraErroPublico } from "@/lib/erros";
import { exigirLimite, chaveUsuario } from "@/lib/rate-limit";
import { validar, marcarRecebidoSchema } from "@/lib/validacao";
import { revalidatePath } from "next/cache";

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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(marcarRecebidoSchema, input, "marcarRecebidoAction");
    // `unidadeId` vem só de `acesso` (sessão), nunca do cliente -
    // `atualizarRecebimento` confere que o pedidoId recebido pertence a
    // essa unidade antes de escrever qualquer coisa.
    await atualizarRecebimento({ ...dados, unidadeId: acesso.unidadeId });
    revalidatePath("/estoque/pedidos/feitos");
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "marcarRecebidoAction") };
  }
}
