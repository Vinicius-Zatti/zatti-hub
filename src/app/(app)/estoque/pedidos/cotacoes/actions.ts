"use server";

import { requireGestao, registrarAuditoria } from "@/lib/acesso";
import { confirmarItem, confirmarVencedor, desfazerVencedor, atualizarPrevisaoEntrega } from "@/lib/pedidos";
import { listProdutos, upsertProduto } from "@/lib/sheets/produtos";
import type { PedidoItem } from "@/lib/types";
import { paraErroPublico } from "@/lib/erros";
import { exigirLimite, chaveUsuario } from "@/lib/rate-limit";
import {
  validar,
  confirmarItemSchema,
  confirmarVencedorSchema,
  desfazerVencedorSchema,
  atualizarPrevisaoEntregaSchema,
} from "@/lib/validacao";
import { revalidatePath } from "next/cache";

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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(confirmarItemSchema, input, "confirmarItemAction");
    await confirmarItem({
      unidadeId: acesso.unidadeId,
      fornecedor: dados.fornecedor,
      dataContagemBase: dados.dataContagemBase,
      item: dados.item,
      atualizarPreco: dados.atualizarPreco,
      criadoPor: acesso.userId,
    });
    revalidarPedidos();
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "confirmarItemAction") };
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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(confirmarVencedorSchema, input, "confirmarVencedorAction");
    await confirmarVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: dados.dataContagemBase,
      fornecedorVencedor: dados.fornecedorVencedor,
      outrosFornecedores: dados.outrosFornecedores,
      item: dados.item,
      criadoPor: acesso.userId,
    });
    await atualizarPrecoCadastroSeMudou(dados.item, acesso);
    revalidarPedidos();
    revalidatePath("/estoque/produtos");
    revalidatePath("/estoque/produtos/edicao");
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "confirmarVencedorAction") };
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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(desfazerVencedorSchema, input, "desfazerVencedorAction");
    await desfazerVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: dados.dataContagemBase,
      fornecedorAtual: dados.fornecedorAtual,
      outrosFornecedores: dados.outrosFornecedores,
      item: dados.item,
      criadoPor: acesso.userId,
    });
    revalidarPedidos();
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "desfazerVencedorAction") };
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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(atualizarPrevisaoEntregaSchema, input, "atualizarPrevisaoEntregaAction");
    await atualizarPrevisaoEntrega({
      unidadeId: acesso.unidadeId,
      fornecedor: dados.fornecedor,
      dataContagemBase: dados.dataContagemBase,
      previsaoEntrega: dados.previsaoEntrega,
      criadoPor: acesso.userId,
    });
    revalidatePath("/estoque/pedidos/cotacoes");
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "atualizarPrevisaoEntregaAction") };
  }
}
