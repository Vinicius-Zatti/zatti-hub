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
  preco_confirmado: boolean;
  vencedor_confirmado: boolean;
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
        precoConfirmado: it.preco_confirmado ?? false,
        vencedorConfirmado: it.vencedor_confirmado,
      })
    ),
  };
}

/** Acha o pedido de um fornecedor (unidade + contagem base) ou cria vazio -
 * nunca apaga itens existentes, diferente do antigo `salvarPedido`. Base de
 * toda gravação item-a-item abaixo. */
async function garantirPedido(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string,
  fornecedor: string,
  dataContagemBase: string,
  criadoPor: string
): Promise<string> {
  const { data: existente } = await supabase
    .from("pedidos")
    .select("id")
    .eq("unidade_id", unidadeId)
    .eq("fornecedor", fornecedor)
    .eq("data_contagem_base", dataContagemBase)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: novo, error } = await supabase
    .from("pedidos")
    .insert({
      unidade_id: unidadeId,
      fornecedor,
      data_contagem_base: dataContagemBase,
      criado_por: criadoPor,
    })
    .select("id")
    .single();
  if (error || !novo) throw new Error(error?.message ?? "Falha ao criar pedido");
  return novo.id;
}

type ItemParaConfirmar = Pick<
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

/** Confirma (cria ou atualiza) UM item do pedido de um fornecedor - nunca
 * mexe nos outros itens dele. Substitui o antigo modelo de "Salvar" (que
 * reescrevia a lista inteira do fornecedor a cada clique): confirmar dois
 * campos diferentes em sequência rápida não corre mais risco de o primeiro
 * terminar depois do segundo e apagar a edição mais nova por cima (o
 * problema real do modelo antigo).
 *
 * Quantidade pedida é a mesma necessidade não importa qual fornecedor acaba
 * fornecendo - por isso, depois de gravar no fornecedor confirmado, o mesmo
 * valor é copiado pra qualquer OUTRO pedido (mesma unidade + contagem base)
 * que já tenha esse SKU salvo. Não cria o item em fornecedor que nunca teve
 * ele - só mantém quem já disputa o item em dia. Preço nunca sincroniza -
 * cada fornecedor cota o próprio valor, é o que dá pra comparar. */
export async function confirmarItem(params: {
  unidadeId: string;
  fornecedor: string;
  dataContagemBase: string;
  item: ItemParaConfirmar;
  /** Confirmação de quantidade não pode apagar nem confirmar o preço que já
   * foi cotado no Editor de Espelhos. */
  atualizarPreco: boolean;
  criadoPor: string;
}): Promise<void> {
  const supabase = await createClient();
  const pedidoId = await garantirPedido(
    supabase,
    params.unidadeId,
    params.fornecedor,
    params.dataContagemBase,
    params.criadoPor
  );

  const linhaBase = {
    nome: params.item.nome,
    nome_compra: params.item.nomeCompra || null,
    unidade_base: params.item.unidadeBase,
    quantidade_pedida: params.item.quantidadePedida,
    preco_antigo: params.item.precoAntigo,
  };
  const linhaComPreco = {
    ...linhaBase,
    preco_atualizado: params.item.precoAtualizado,
    preco_confirmado: params.item.precoConfirmado,
  };

  const { data: existente } = await supabase
    .from("pedido_itens")
    .select("id")
    .eq("pedido_id", pedidoId)
    .eq("sku", params.item.sku)
    .maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from("pedido_itens")
      .update(params.atualizarPreco ? linhaComPreco : linhaBase)
      .eq("id", existente.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("pedido_itens")
      .insert({ pedido_id: pedidoId, sku: params.item.sku, ...linhaComPreco });
    if (error) throw new Error(error.message);
  }

  const { data: outrosPedidos } = await supabase
    .from("pedidos")
    .select("id")
    .eq("unidade_id", params.unidadeId)
    .eq("data_contagem_base", params.dataContagemBase)
    .neq("fornecedor", params.fornecedor);

  const outrosIds = (outrosPedidos ?? []).map((p) => p.id);
  if (outrosIds.length > 0) {
    await supabase
      .from("pedido_itens")
      .update({ quantidade_pedida: params.item.quantidadePedida })
      .eq("sku", params.item.sku)
      .in("pedido_id", outrosIds);
  }
}

/** Confirma o fornecedor vencedor de um item - editar quantidade/preço
 * sozinho NUNCA marca isso, só esse clique explícito. Vale pra item
 * disputado (2+ fornecedores) e pra fornecedor único também: nenhum dos
 * dois casos deve contar como pedido de verdade sem essa confirmação - se
 * fosse só "tem quantidade salva", fornecedor único ficaria sempre
 * "confirmado" na hora que a quantidade é editada, mesmo sem ninguém ter
 * decidido de propósito. Remove o item dos concorrentes que perderam (se
 * houver) - eles deixam de ter esse SKU no próprio pedido. */
export async function confirmarVencedor(params: {
  unidadeId: string;
  dataContagemBase: string;
  fornecedorVencedor: string;
  outrosFornecedores: string[];
  item: ItemParaConfirmar;
  criadoPor: string;
}): Promise<void> {
  const supabase = await createClient();
  await confirmarItem({
    unidadeId: params.unidadeId,
    fornecedor: params.fornecedorVencedor,
    dataContagemBase: params.dataContagemBase,
    item: params.item,
    atualizarPreco: true,
    criadoPor: params.criadoPor,
  });
  const pedidoIdVencedor = await garantirPedido(
    supabase,
    params.unidadeId,
    params.fornecedorVencedor,
    params.dataContagemBase,
    params.criadoPor
  );
  const { error: erroMarcarVencedor } = await supabase
    .from("pedido_itens")
    .update({ vencedor_confirmado: true })
    .eq("pedido_id", pedidoIdVencedor)
    .eq("sku", params.item.sku);
  if (erroMarcarVencedor) throw new Error(erroMarcarVencedor.message);

  if (params.outrosFornecedores.length === 0) return;
  const { data: pedidosPerdedores, error: erroBuscarPerdedores } = await supabase
    .from("pedidos")
    .select("id")
    .eq("unidade_id", params.unidadeId)
    .eq("data_contagem_base", params.dataContagemBase)
    .in("fornecedor", params.outrosFornecedores);
  if (erroBuscarPerdedores) throw new Error(erroBuscarPerdedores.message);

  const ids = (pedidosPerdedores ?? []).map((p) => p.id);
  if (ids.length > 0) {
    const { error: erroRemoverPerdedores } = await supabase
      .from("pedido_itens")
      .delete()
      .eq("sku", params.item.sku)
      .in("pedido_id", ids);
    if (erroRemoverPerdedores) throw new Error(erroRemoverPerdedores.message);
  }
}

/** Desfaz a confirmação de vencedor: tira a marca do fornecedor atual e, se
 * o item tinha concorrentes que perderam a disputa, recria o item neles
 * (mesma quantidade, preço não confirmado). Pra fornecedor único
 * (sem concorrente nenhum), só desmarca - não tem ninguém pra recriar. */
export async function desfazerVencedor(params: {
  unidadeId: string;
  dataContagemBase: string;
  fornecedorAtual: string;
  outrosFornecedores: string[];
  item: Omit<ItemParaConfirmar, "precoAtualizado" | "precoConfirmado">;
  criadoPor: string;
}): Promise<void> {
  const supabase = await createClient();
  const pedidoIdAtual = await garantirPedido(
    supabase,
    params.unidadeId,
    params.fornecedorAtual,
    params.dataContagemBase,
    params.criadoPor
  );
  const { error: erroDesmarcarVencedor } = await supabase
    .from("pedido_itens")
    .update({ vencedor_confirmado: false })
    .eq("pedido_id", pedidoIdAtual)
    .eq("sku", params.item.sku);
  if (erroDesmarcarVencedor) throw new Error(erroDesmarcarVencedor.message);

  await Promise.all(
    params.outrosFornecedores.map((fornecedor) =>
      confirmarItem({
        unidadeId: params.unidadeId,
        fornecedor,
        dataContagemBase: params.dataContagemBase,
        item: { ...params.item, precoAtualizado: null, precoConfirmado: false },
        atualizarPreco: true,
        criadoPor: params.criadoPor,
      })
    )
  );
}

/** Atualiza só a previsão de entrega de um fornecedor - campo isolado, sem
 * depender de nenhum item pra existir. */
export async function atualizarPrevisaoEntrega(params: {
  unidadeId: string;
  fornecedor: string;
  dataContagemBase: string;
  previsaoEntrega: string | null;
  criadoPor: string;
}): Promise<void> {
  const supabase = await createClient();
  const pedidoId = await garantirPedido(
    supabase,
    params.unidadeId,
    params.fornecedor,
    params.dataContagemBase,
    params.criadoPor
  );
  await supabase
    .from("pedidos")
    .update({ previsao_entrega: params.previsaoEntrega, atualizado_em: new Date().toISOString() })
    .eq("id", pedidoId);
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
  unidadeId: string;
  pedidoId: string;
  recebido: boolean;
  observacaoEntrega: string | null;
  itensRecebidos: { sku: string; quantidadeRecebida: number | null }[];
}): Promise<void> {
  const supabase = await createClient();

  // pedidoId vem do navegador. Confirma o escopo da unidade resolvida pela
  // sessao antes de qualquer escrita, sem depender apenas da policy RLS.
  const { data: pedido, error: erroPedido } = await supabase
    .from("pedidos")
    .select("id")
    .eq("id", params.pedidoId)
    .eq("unidade_id", params.unidadeId)
    .maybeSingle();
  if (erroPedido) throw new Error("Nao foi possivel validar o pedido");
  if (!pedido) throw new Error("Pedido nao encontrado nesta unidade");

  const { data: pedidoAtualizado, error: erroAtualizarPedido } = await supabase
    .from("pedidos")
    .update({
      recebido: params.recebido,
      observacao_entrega: params.observacaoEntrega,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", params.pedidoId)
    .eq("unidade_id", params.unidadeId)
    .select("id")
    .maybeSingle();
  if (erroAtualizarPedido || !pedidoAtualizado) {
    throw new Error("Nao foi possivel atualizar o recebimento");
  }

  for (const item of params.itensRecebidos) {
    const { data: itemAtualizado, error: erroAtualizarItem } = await supabase
      .from("pedido_itens")
      .update({ quantidade_recebida: item.quantidadeRecebida })
      .eq("pedido_id", params.pedidoId)
      .eq("sku", item.sku)
      .select("id")
      .maybeSingle();
    if (erroAtualizarItem || !itemAtualizado) {
      throw new Error("Um item do pedido nao pertence a esta unidade");
    }
  }
}
