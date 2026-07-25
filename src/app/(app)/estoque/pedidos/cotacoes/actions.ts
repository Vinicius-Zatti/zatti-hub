"use server";

import { requireGestao, registrarAuditoria } from "@/lib/acesso";
import { salvarPedido } from "@/lib/pedidos";
import { listProdutos, upsertProduto } from "@/lib/sheets/produtos";
import type { PedidoItem } from "@/lib/types";
import { revalidatePath } from "next/cache";

type ItemSalvar = Pick<
  PedidoItem,
  "sku" | "nome" | "unidadeBase" | "quantidadePedida" | "precoAntigo" | "precoAtualizado"
>;

/** Salva o Editor de Espelhos de um fornecedor - primeira vez cria o
 * pedido, chamadas seguintes (mesmo fornecedor + mesma contagem base)
 * atualizam o mesmo registro, é assim que dá pra editar depois de salvo. Se
 * algum preço mudou em relação ao Cadastro, atualiza o Cadastro dali pra
 * frente (contagens antigas mantêm o preço que tinham) e grava auditoria
 * com o valor antigo e o novo. */
export async function salvarPedidoAction(input: {
  fornecedor: string;
  dataContagemBase: string;
  previsaoEntrega: string | null;
  itens: ItemSalvar[];
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();

  try {
    await salvarPedido({
      unidadeId: acesso.unidadeId,
      fornecedor: input.fornecedor,
      dataContagemBase: input.dataContagemBase,
      previsaoEntrega: input.previsaoEntrega,
      itens: input.itens,
      criadoPor: acesso.userId,
    });

    const precosMudaram = input.itens.filter(
      (it) => it.precoAtualizado !== null && it.precoAtualizado !== it.precoAntigo
    );
    if (precosMudaram.length > 0) {
      const produtos = await listProdutos(acesso.spreadsheetId);
      for (const item of precosMudaram) {
        const produto = produtos.find((p) => p.sku === item.sku);
        if (!produto) continue;
        const precoAntes = produto.precoUnitario;
        await upsertProduto({ ...produto, precoUnitario: item.precoAtualizado }, acesso.spreadsheetId);
        await registrarAuditoria({
          acesso,
          acao: "atualizar_preco_via_pedido",
          entidade: "produto",
          entidadeId: item.sku,
          dadosAntigos: { precoUnitario: precoAntes },
          dadosNovos: { precoUnitario: item.precoAtualizado },
        });
      }
    }

    revalidatePath("/estoque/pedidos/cotacoes");
    revalidatePath("/estoque/pedidos/feitos");
    revalidatePath("/estoque/produtos");
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}
