"use server";

import { requireGestao, registrarAuditoria } from "@/lib/acesso";
import { confirmarItem, confirmarVencedor, desfazerVencedor, atualizarPrevisaoEntrega } from "@/lib/pedidos";
import { listProdutos, upsertProduto } from "@/lib/sheets/produtos";
import type { PedidoItem } from "@/lib/types";
import { revalidatePath } from "next/cache";

type ItemConfirmar = Pick<
  PedidoItem,
  "sku" | "nome" | "nomeCompra" | "unidadeBase" | "quantidadePedida" | "precoAntigo" | "precoAtualizado"
>;

function revalidarPedidos() {
  revalidatePath("/estoque/pedidos");
  revalidatePath("/estoque/pedidos/cotacoes");
  revalidatePath("/estoque/pedidos/feitos");
}

/** Se o preço atualizado mudou em relação ao Cadastro, atualiza o Cadastro
 * dali pra frente (contagens antigas mantêm o preço que tinham) e grava
 * auditoria com o valor antigo e o novo. */
async function atualizarPrecoCadastroSeMudou(item: ItemConfirmar, acesso: Awaited<ReturnType<typeof requireGestao>>) {
  if (item.precoAtualizado === null || item.precoAtualizado === item.precoAntigo) return;
  const produtos = await listProdutos(acesso.spreadsheetId);
  const produto = produtos.find((p) => p.sku === item.sku);
  if (!produto) return;
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

/** Confirma um item (quantidade e/ou preço) - grava na hora, sem esperar
 * nenhum botão "Salvar" (não existe mais). Usada por Criar Cotação e
 * Editor de Espelhos. */
export async function confirmarItemAction(input: {
  fornecedor: string;
  dataContagemBase: string;
  item: ItemConfirmar;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await confirmarItem({
      unidadeId: acesso.unidadeId,
      fornecedor: input.fornecedor,
      dataContagemBase: input.dataContagemBase,
      item: input.item,
      criadoPor: acesso.userId,
    });
    await atualizarPrecoCadastroSeMudou(input.item, acesso);
    revalidarPedidos();
    revalidatePath("/estoque/produtos");
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}

/** Escolhe o fornecedor vencedor de um item disputado no Editor de Espelhos -
 * remove o item dos concorrentes que perderam na mesma hora. */
export async function confirmarVencedorAction(input: {
  dataContagemBase: string;
  fornecedorVencedor: string;
  outrosFornecedores: string[];
  item: ItemConfirmar;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await confirmarVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: input.dataContagemBase,
      fornecedorVencedor: input.fornecedorVencedor,
      outrosFornecedores: input.outrosFornecedores,
      item: input.item,
      criadoPor: acesso.userId,
    });
    await atualizarPrecoCadastroSeMudou(input.item, acesso);
    revalidarPedidos();
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}

/** Desfaz a confirmação de vencedor - desmarca o fornecedor atual e recria o
 * item nos concorrentes que tinham perdido (se houver), preço em branco pra
 * eles reconferirem. */
export async function desfazerVencedorAction(input: {
  dataContagemBase: string;
  fornecedorAtual: string;
  outrosFornecedores: string[];
  item: Omit<ItemConfirmar, "precoAtualizado">;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await desfazerVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: input.dataContagemBase,
      fornecedorAtual: input.fornecedorAtual,
      outrosFornecedores: input.outrosFornecedores,
      item: input.item,
      criadoPor: acesso.userId,
    });
    revalidarPedidos();
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}

/** Atualiza a previsão de entrega de um fornecedor - campo isolado, grava
 * assim que o usuário escolhe a data. */
export async function atualizarPrevisaoEntregaAction(input: {
  fornecedor: string;
  dataContagemBase: string;
  previsaoEntrega: string | null;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await atualizarPrevisaoEntrega({
      unidadeId: acesso.unidadeId,
      fornecedor: input.fornecedor,
      dataContagemBase: input.dataContagemBase,
      previsaoEntrega: input.previsaoEntrega,
      criadoPor: acesso.userId,
    });
    revalidatePath("/estoque/pedidos/cotacoes");
    return { ok: true };
  } catch (err) {
    return { erro: (err as Error).message };
  }
}
