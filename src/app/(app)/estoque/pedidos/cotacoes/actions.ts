"use server";

import { requireGestao, registrarAuditoria, exigirEdicao } from "@/lib/acesso";
import {
  confirmarItem,
  confirmarVencedor,
  desfazerVencedor,
  atualizarPrevisaoEntrega,
  listarParticipacoesCotacao,
} from "@/lib/pedidos";
import { listProdutos, atualizarPrecoProduto, vincularFornecedorNoProduto } from "@/lib/sheets/produtos";
import { SEM_FORNECEDOR, unirConcorrentes } from "@/lib/pedido";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { sincronizarCustosPrePreparoMelhorEsforco } from "@/lib/banco/pre-preparo";
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

// Confirmar item, vencedor e previsão NÃO revalidam (fase 3 de velocidade,
// 23/10/2026). Toda tela daqui é force-dynamic e sem cache de dados, então
// revalidatePath só servia pra renderizar de novo a tela aberta, e o Next
// fazia isso a cada clique: relia contagens, produtos, fornecedores e pedidos
// e recalculava a cotação inteira. Com as actions em fila, a The House
// esperava esse recálculo item por item. Criar Cotação e Editor de Espelhos
// já guardam o que foi confirmado no próprio estado; a próxima navegação lê
// tudo fresco do banco. Exceção: voltar/avançar do navegador reaproveita a
// tela guardada; por isso as duas telas chamam `sincronizarCotacaoAction`
// depois de uma pausa nos cliques e ao sair (`use-sincronizar-cotacao.ts`).
// Só o desfazer (raro, recria itens em outros blocos) revalida na hora.
function revalidarPedidos() {
  revalidatePath("/estoque/pedidos");
  revalidatePath("/estoque/pedidos/cotacoes");
  revalidatePath("/estoque/pedidos/feitos");
}

/** Revalida as telas de pedido de uma vez, depois de uma sequência de
 * Confirmar (ver comentário de `revalidarPedidos`). Produtos entra porque o
 * vencedor pode ter atualizado preço e vínculo no Cadastro. */
export async function sincronizarCotacaoAction(): Promise<void> {
  await requireGestao();
  revalidarPedidos();
  revalidatePath("/estoque/produtos");
  revalidatePath("/estoque/produtos/edicao");
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
  await atualizarPrecoProduto(produto, item.precoAtualizado, acesso.spreadsheetId);
  await registrarAuditoria({
    acesso,
    acao: "atualizar_preco_via_pedido",
    entidade: "produto",
    entidadeId: item.sku,
    dadosAntigos: { precoUnitario: precoAntes },
    dadosNovos: { precoUnitario: item.precoAtualizado },
  });
  // Insumo de pré-preparo com ficha muda o preço do pré-preparo (piloto).
  if (acesso.fichasTecnicasHabilitado) await sincronizarCustosPrePreparoMelhorEsforco(acesso.unidadeId);
}

/** Item trazido pelo "+ Adicionar item" de um fornecedor que não estava
 * ligado a ele: grava o vínculo no Cadastro (Vinícius, 23/10/2026), pra ele
 * já aparecer nesse fornecedor nas próximas cotações. O pedido já foi salvo
 * antes; falha aqui vira aviso, nunca desfaz a confirmação. */
async function vincularFornecedorNoCadastro(
  sku: string,
  fornecedor: string,
  acesso: Awaited<ReturnType<typeof requireGestao>>
): Promise<string | undefined> {
  if (fornecedor === SEM_FORNECEDOR) return undefined;
  try {
    // Atômico no banco (parecer do Codex, 24/10/2026): confirmações ao mesmo
    // tempo não disputam a mesma vaga nem regravam o produto inteiro.
    const resultado = await vincularFornecedorNoProduto(sku, fornecedor, acesso.spreadsheetId);
    if (resultado === "sem_vaga") {
      return "Item salvo no pedido. O produto já tem 4 fornecedores no Cadastro, então este não ficou ligado a ele.";
    }
    if (resultado !== "vinculado") return undefined;
    await registrarAuditoria({
      acesso,
      acao: "vincular_fornecedor_via_cotacao",
      entidade: "produto",
      entidadeId: sku,
      dadosNovos: { fornecedor },
    });
    return undefined;
  } catch {
    return "Item salvo no pedido, mas não foi possível ligar o fornecedor ao produto no Cadastro.";
  }
}

/** Confirma um item (quantidade e/ou preço) - grava na hora, sem esperar
 * nenhum botão "Salvar" (não existe mais). Usada por Criar Cotação e
 * Editor de Espelhos. */
export async function confirmarItemAction(input: {
  fornecedor: string;
  dataContagemBase: string;
  item: ItemConfirmar;
  atualizarPreco: boolean;
  vincularFornecedor?: boolean;
}): Promise<{ ok: true; aviso?: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "estoque");
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
    const aviso = entrada.vincularFornecedor
      ? await vincularFornecedorNoCadastro(entrada.item.sku, entrada.fornecedor, acesso)
      : undefined;
    return aviso ? { ok: true, aviso } : { ok: true };
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
  vincularFornecedor?: boolean;
}): Promise<{ ok: true; aviso?: string } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "estoque");
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
    const aviso = entrada.vincularFornecedor
      ? await vincularFornecedorNoCadastro(entrada.item.sku, entrada.fornecedorVencedor, acesso)
      : undefined;
    return aviso ? { ok: true, aviso } : { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel confirmar o fornecedor.") };
  }
}

/** Desfaz a confirmação de vencedor - desmarca o fornecedor atual e recria o
 * item nos concorrentes que tinham perdido (se houver). O preço do Cadastro
 * volta apenas como referência na tela e precisa ser confirmado de novo.
 *
 * Concorrentes: os da tela mais os que participaram da cotação do item
 * (`cotacao_participacoes`, parecer do Codex de 24/10/2026). O avulso do "+
 * Adicionar item" fora das 4 vagas do Cadastro volta mesmo que a tela tenha
 * sido recarregada ou o vínculo tenha falhado. Devolve quem foi recriado. */
export async function desfazerVencedorAction(input: {
  dataContagemBase: string;
  fornecedorAtual: string;
  outrosFornecedores: string[];
  item: Omit<ItemConfirmar, "precoAtualizado" | "precoConfirmado">;
}): Promise<{ ok: true; concorrentes: string[] } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "estoque");
    await exigirLimiteRequisicao("pedidos_cotacao");
    const entrada = validarEntrada(desfazerVencedorSchema, input);
    const [participacoes, fornecedoresCadastro] = await Promise.all([
      listarParticipacoesCotacao(acesso.unidadeId, entrada.dataContagemBase, entrada.item.sku),
      listFornecedores(acesso.spreadsheetId),
    ]);
    const concorrentes = unirConcorrentes(
      entrada.fornecedorAtual,
      entrada.outrosFornecedores,
      participacoes.map((p) => p.fornecedor),
      fornecedoresCadastro.map((f) => f.nomeFantasia || f.razaoSocial).filter(Boolean)
    );
    await desfazerVencedor({
      unidadeId: acesso.unidadeId,
      dataContagemBase: entrada.dataContagemBase,
      fornecedorAtual: entrada.fornecedorAtual,
      outrosFornecedores: concorrentes,
      item: entrada.item,
      criadoPor: acesso.userId,
    });
    revalidarPedidos();
    return { ok: true, concorrentes };
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
    exigirEdicao(acesso, "estoque");
    await exigirLimiteRequisicao("pedidos_cotacao");
    const entrada = validarEntrada(previsaoEntregaSchema, input);
    await atualizarPrevisaoEntrega({
      unidadeId: acesso.unidadeId,
      fornecedor: entrada.fornecedor,
      dataContagemBase: entrada.dataContagemBase,
      previsaoEntrega: entrada.previsaoEntrega,
      criadoPor: acesso.userId,
    });
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel atualizar a previsao.") };
  }
}
