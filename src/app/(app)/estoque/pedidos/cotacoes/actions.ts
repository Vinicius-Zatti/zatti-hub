"use server";

import { requireGestao, registrarAuditoria } from "@/lib/acesso";
import { confirmarItem, confirmarVencedor, desfazerVencedor, atualizarPrevisaoEntrega } from "@/lib/pedidos";
import { listProdutos, upsertProduto } from "@/lib/sheets/produtos";
import type { PedidoItem } from "@/lib/types";
import { revalidatePath } from "next/cache";
import {
  confirmarItemSchema,
  confirmarVencedorSchema,
  desfazerVencedorSchema,
  previsaoEntregaSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";

type ItemConfirmar = Pick<
  PedidoItem,
  | "sku"
  | "nome"
  | "nomeCompra"
  | "unidadeBase"
  | "quantidadePedida"
  | "precoAntigo"
  | "precoAtualizado"
  | "precoConfirmado"
>;

function revalidarPedidos() {
  revalidatePath("/estoque/pedidos");
  revalidatePath("/estoque/pedidos/cotacoes");
  revalidatePath("/estoque/pedidos/feitos");
}

/** Só o preço do fornecedor vencedor atualiza o Cadastro dali pra frente.
 * Confirmar uma cotação isolada nunca muda a referência dos concorrentes. */
async function atualizarPrecoCadastroSeMudou(item: ItemConfirmar, acesso: Awaited<ReturnType<typeof requireGestao>>) {
  if (item.precoAtualizado === null) return;
  const produtos = await listProdutos(acesso.spreadsheetId);
  const produto = produtos.find((p) => p.sku === item.sku);
  if (!produto) return;
  const precoAntes = produto.precoUnitario;
  if (precoAntes !== null && Math.abs(precoAntes - item.precoAtualizado) < 0.001) return;
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
  atualizarPreco: boolean;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("pedidos_cotacao");
    const entrada = validarEntrada(confirmarItemSchema, input);
    await confirmarItem({
      unidadeId: acesso.unidadeId,
      fornecedor: entrada.fornecedor,
      dataContagemBase: entrada.dataContagemBase,
      item: entrada.item,
      atualizarPreco: entrada.atualizarPreco,
      criadoPor: acesso.userId,
    });
    revalidarPedidos();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel confirmar o item.") };
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
    await exigirLimiteRequisicao("pedidos_cotacao");
    const entrada = validarEntrada(confirmarVencedorSchema, input);
    await confirmarVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: entrada.dataContagemBase,
      fornecedorVencedor: entrada.fornecedorVencedor,
      outrosFornecedores: entrada.outrosFornecedores,
      item: entrada.item,
      criadoPor: acesso.userId,
    });
    await atualizarPrecoCadastroSeMudou(entrada.item, acesso);
    revalidarPedidos();
    revalidatePath("/estoque/produtos");
    revalidatePath("/estoque/produtos/edicao");
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel confirmar o fornecedor.") };
  }
}

/** Desfaz a confirmação de vencedor - desmarca o fornecedor atual e recria o
 * item nos concorrentes que tinham perdido (se houver). O preço do Cadastro
 * volta apenas como referência na tela e precisa ser confirmado de novo. */
export async function desfazerVencedorAction(input: {
  dataContagemBase: string;
  fornecedorAtual: string;
  outrosFornecedores: string[];
  item: Omit<ItemConfirmar, "precoAtualizado" | "precoConfirmado">;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    await exigirLimiteRequisicao("pedidos_cotacao");
    const entrada = validarEntrada(desfazerVencedorSchema, input);
    await desfazerVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: entrada.dataContagemBase,
      fornecedorAtual: entrada.fornecedorAtual,
      outrosFornecedores: entrada.outrosFornecedores,
      item: entrada.item,
      criadoPor: acesso.userId,
    });
    revalidarPedidos();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel desfazer a confirmacao.") };
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
    await exigirLimiteRequisicao("pedidos_cotacao");
    const entrada = validarEntrada(previsaoEntregaSchema, input);
    await atualizarPrevisaoEntrega({
      unidadeId: acesso.unidadeId,
      fornecedor: entrada.fornecedor,
      dataContagemBase: entrada.dataContagemBase,
      previsaoEntrega: entrada.previsaoEntrega,
      criadoPor: acesso.userId,
    });
    revalidatePath("/estoque/pedidos/cotacoes");
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel atualizar a previsao.") };
  }
}
