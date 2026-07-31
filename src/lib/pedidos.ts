import { createClient } from "@/lib/supabase/server";
import type { Pedido, PedidoItem } from "@/lib/types";

type PedidoRow = {
  id: string;
  fornecedor: string;
  data_contagem_base: string;
  previsao_entrega: string | null;
  observacao_entrega: string | null;
  recebido: boolean;
  criado_em: string;
  atualizado_em: string;
};

type PedidoItemRow = {
  sku: string;
  nome: string;
  nome_compra: string | null;
  unidade_base: string;
  quantidade_pedida: number;
  quantidade_recebida: number | null;
  preco_antigo: number | null;
  preco_atualizado: number | null;
};

function rowToPedido(row: PedidoRow, itens: PedidoItemRow[]): Pedido {
  return {
    id: row.id,
    fornecedor: row.fornecedor,
    dataContagemBase: row.data_contagem_base,
    previsaoEntrega: row.previsao_entrega,
    observacaoEntrega: row.observacao_entrega,
    recebido: row.recebido,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    itens: itens.map(
      (it): PedidoItem => ({
        sku: it.sku,
        nome: it.nome,
        nomeCompra: it.nome_compra ?? "",
        unidadeBase: it.unidade_base,
        quantidadePedida: Number(it.quantidade_pedida),
        quantidadeRecebida: it.quantidade_recebida === null ? null : Number(it.quantidade_recebida),
        precoAntigo: it.preco_antigo === null ? null : Number(it.preco_antigo),
        precoAtualizado: it.preco_atualizado === null ? null : Number(it.preco_atualizado),
      })
    ),
  };
}

/** Pedido já salvo pra esse fornecedor + contagem base, se existir - o
 * Editor de Espelhos carrega daqui em vez de recalcular quando já foi
 * salvo antes (permite editar depois de salvo). */
export async function getPedidoSalvo(
  unidadeId: string,
  fornecedor: string,
  dataContagemBase: string
): Promise<Pedido | null> {
  const supabase = await createClient();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*")
    .eq("unidade_id", unidadeId)
    .eq("fornecedor", fornecedor)
    .eq("data_contagem_base", dataContagemBase)
    .maybeSingle();

  if (!pedido) return null;

  const { data: itens } = await supabase
    .from("pedido_itens")
    .select("*")
    .eq("pedido_id", pedido.id);

  return rowToPedido(pedido as PedidoRow, (itens as PedidoItemRow[] | null) ?? []);
}

/** Salva (cria ou atualiza) o pedido de um fornecedor - chave natural é
 * (unidade, fornecedor, data da contagem base). Reescreve os itens inteiros
 * a cada save, mais simples que tentar diff - o volume por pedido é baixo. */
export async function salvarPedido(params: {
  unidadeId: string;
  fornecedor: string;
  dataContagemBase: string;
  previsaoEntrega: string | null;
  itens: Pick<
    PedidoItem,
    "sku" | "nome" | "nomeCompra" | "unidadeBase" | "quantidadePedida" | "precoAntigo" | "precoAtualizado"
  >[];
  criadoPor: string;
}): Promise<Pedido> {
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("pedidos")
    .select("id")
    .eq("unidade_id", params.unidadeId)
    .eq("fornecedor", params.fornecedor)
    .eq("data_contagem_base", params.dataContagemBase)
    .maybeSingle();

  let pedidoId: string;
  if (existente) {
    pedidoId = existente.id;
    await supabase
      .from("pedidos")
      .update({
        previsao_entrega: params.previsaoEntrega,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", pedidoId);
    await supabase.from("pedido_itens").delete().eq("pedido_id", pedidoId);
  } else {
    const { data: novo, error } = await supabase
      .from("pedidos")
      .insert({
        unidade_id: params.unidadeId,
        fornecedor: params.fornecedor,
        data_contagem_base: params.dataContagemBase,
        previsao_entrega: params.previsaoEntrega,
        criado_por: params.criadoPor,
      })
      .select("id")
      .single();
    if (error || !novo) throw new Error(error?.message ?? "Falha ao criar pedido");
    pedidoId = novo.id;
  }

  if (params.itens.length > 0) {
    await supabase.from("pedido_itens").insert(
      params.itens.map((it) => ({
        pedido_id: pedidoId,
        sku: it.sku,
        nome: it.nome,
        nome_compra: it.nomeCompra || null,
        unidade_base: it.unidadeBase,
        quantidade_pedida: it.quantidadePedida,
        preco_antigo: it.precoAntigo,
        preco_atualizado: it.precoAtualizado,
      }))
    );
  }

  const salvo = await getPedidoSalvo(params.unidadeId, params.fornecedor, params.dataContagemBase);
  if (!salvo) throw new Error("Pedido salvo mas não encontrado na releitura");
  return salvo;
}

/** Todos os pedidos já salvos (de qualquer fornecedor) pra uma contagem base
 * específica - usado pelo Editor de Espelhos pra garantir que um fornecedor
 * com pedido salvo continue aparecendo mesmo se o recálculo fresco não
 * indicar mais necessidade de compra pra nenhum item dele (ex: item sem
 * fornecedor cadastrado que foi adicionado manualmente em Criar Cotação -
 * sem isso, o pedido salvo fica invisível na tela, embora exista no banco). */
export async function listPedidosPorContagemBase(unidadeId: string, dataContagemBase: string): Promise<Pedido[]> {
  const supabase = await createClient();

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .eq("unidade_id", unidadeId)
    .eq("data_contagem_base", dataContagemBase);

  const rows = (pedidos as PedidoRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const { data: todosItens } = await supabase
    .from("pedido_itens")
    .select("*")
    .in(
      "pedido_id",
      rows.map((r) => r.id)
    );

  const itensPorPedido = new Map<string, PedidoItemRow[]>();
  for (const it of (todosItens as (PedidoItemRow & { pedido_id: string })[] | null) ?? []) {
    const lista = itensPorPedido.get(it.pedido_id) ?? [];
    lista.push(it);
    itensPorPedido.set(it.pedido_id, lista);
  }

  return rows.map((row) => rowToPedido(row, itensPorPedido.get(row.id) ?? []));
}

/** Todos os pedidos já salvos de uma unidade, mais recente primeiro - base
 * da tela Pedidos Feitos. */
export async function listPedidosFeitos(unidadeId: string): Promise<Pedido[]> {
  const supabase = await createClient();

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("*")
    .eq("unidade_id", unidadeId)
    .order("criado_em", { ascending: false });

  const rows = (pedidos as PedidoRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const { data: todosItens } = await supabase
    .from("pedido_itens")
    .select("*")
    .in(
      "pedido_id",
      rows.map((r) => r.id)
    );

  const itensPorPedido = new Map<string, PedidoItemRow[]>();
  for (const it of (todosItens as (PedidoItemRow & { pedido_id: string })[] | null) ?? []) {
    const lista = itensPorPedido.get(it.pedido_id) ?? [];
    lista.push(it);
    itensPorPedido.set(it.pedido_id, lista);
  }

  return rows.map((row) => rowToPedido(row, itensPorPedido.get(row.id) ?? []));
}

/** Ação restrita: só toca recebimento (quantidade recebida por item,
 * observação, marcar recebido) - nunca preço nem quantidade pedida. É o que
 * permite o papel Operacional mexer em Pedidos Feitos com segurança, mesmo
 * chamando essa mesma função. */
export async function atualizarRecebimento(params: {
  pedidoId: string;
  recebido: boolean;
  observacaoEntrega: string | null;
  itensRecebidos: { sku: string; quantidadeRecebida: number | null }[];
}): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("pedidos")
    .update({
      recebido: params.recebido,
      observacao_entrega: params.observacaoEntrega,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", params.pedidoId);

  for (const item of params.itensRecebidos) {
    await supabase
      .from("pedido_itens")
      .update({ quantidade_recebida: item.quantidadeRecebida })
      .eq("pedido_id", params.pedidoId)
      .eq("sku", item.sku);
  }
}
