import { createClient } from "@/lib/supabase/server";
import { buscarTudo } from "@/lib/banco/paginacao";
import { ErroPublico } from "@/lib/erros";
import {
  TAMANHO_PAGINA_EXTRATO,
  linhaDaView,
  saldoDaView,
  type FiltroExtrato,
  type LinhaExtrato,
  type MotivoPerda,
  type ProdutoParaPerda,
  type SaldoSku,
} from "@/lib/extrato";

// Extrato do estoque v1. Leitura pelas views `estoque_extrato_linhas` e
// `estoque_saldos` (security invoker: a RLS de cada tabela vale). Escrita só
// pelas RPCs do banco - a Data API não grava em `estoque_movimentacoes`.

type Cliente = Awaited<ReturnType<typeof createClient>>;

function erroDaFuncao(error: { code?: string; message: string }, prefixo: string): Error {
  if (error.code === "P0001") return new ErroPublico(error.message);
  if (error.code === "42501") return new ErroPublico("Você não tem permissão para esta ação.");
  return new Error(`${prefixo}: ${error.message}`);
}

const COLUNAS_EXTRATO =
  "linha_id, movimentacao_id, data, natureza, tipo, origem, sku, nome, unidade_base, quantidade, " +
  "quantidade_sinal, custo_unitario, valor, quantidade_conferida, motivo, observacao, fornecedor, " +
  "cancelado_em, motivo_cancelamento";

function consultaExtrato(supabase: Cliente, unidadeId: string, filtro: FiltroExtrato, contar: boolean) {
  let q = supabase
    .from("estoque_extrato_linhas")
    .select(COLUNAS_EXTRATO, contar ? { count: "exact" } : undefined)
    .eq("unidade_id", unidadeId);
  if (filtro.de) q = q.gte("data", filtro.de);
  if (filtro.ate) q = q.lte("data", filtro.ate);
  if (filtro.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro.sku) q = q.eq("sku", filtro.sku);
  if (!filtro.incluirCancelados) q = q.is("cancelado_em", null);
  // Mais recente primeiro, ordem estável: data, posição antes dos lançamentos
  // do mesmo dia (abertura), criado_em, id.
  return q
    .order("data", { ascending: false })
    .order("ordem_no_dia", { ascending: false })
    .order("criado_em", { ascending: false })
    .order("linha_id", { ascending: false });
}

export async function listarExtratoPagina(
  unidadeId: string,
  filtro: FiltroExtrato,
): Promise<{ linhas: LinhaExtrato[]; total: number }> {
  const supabase = await createClient();
  const de = (filtro.pagina - 1) * TAMANHO_PAGINA_EXTRATO;
  const { data, error, count } = await consultaExtrato(supabase, unidadeId, filtro, true).range(
    de,
    de + TAMANHO_PAGINA_EXTRATO - 1,
  );
  if (error) throw new Error(`Não foi possível carregar o extrato: ${error.message}`);
  return {
    linhas: ((data ?? []) as unknown as Record<string, unknown>[]).map(linhaDaView),
    total: count ?? 0,
  };
}

/** Todas as linhas do filtro (para o CSV). Paginada até o fim; erro em
 * qualquer página derruba a leitura inteira, nunca devolve parcial. */
export async function listarExtratoCompleto(unidadeId: string, filtro: FiltroExtrato): Promise<LinhaExtrato[]> {
  const supabase = await createClient();
  const linhas = await buscarTudo<Record<string, unknown>>((de, ate) =>
    consultaExtrato(supabase, unidadeId, filtro, false).range(de, ate),
  ).catch((erro: Error) => {
    throw new Error(`Não foi possível carregar o extrato: ${erro.message}`);
  });
  return linhas.map(linhaDaView);
}

/** Saldo por SKU (view `estoque_saldos`). Só itens com posição ou lançamento,
 * mais os ativos - item inativo e sem nada não interessa ao extrato. */
export async function listarSaldos(unidadeId: string, sku: string | null): Promise<SaldoSku[]> {
  const supabase = await createClient();
  const linhas = await buscarTudo<Record<string, unknown>>((de, ate) => {
    let q = supabase
      .from("estoque_saldos")
      .select(
        "produto_id, sku, nome, unidade_base, ativo, ultimo_preco_pago, ultimo_preco_pago_em, " +
          "data_posicao, quantidade_posicao, entradas, saidas, saldo, lancamentos_desde_posicao",
      )
      .eq("unidade_id", unidadeId);
    if (sku) q = q.eq("sku", sku);
    return q.order("sku").order("produto_id").range(de, ate);
  }).catch((erro: Error) => {
    throw new Error(`Não foi possível carregar os saldos: ${erro.message}`);
  });
  return linhas.map(saldoDaView).filter((s) => s.ativo || s.dataPosicao !== null || s.lancamentosDesdePosicao > 0);
}

export async function listarProdutosParaPerda(unidadeId: string): Promise<ProdutoParaPerda[]> {
  const supabase = await createClient();
  const linhas = await buscarTudo<{ id: string; sku: string; nome: string; unidade_base: string }>((de, ate) =>
    supabase
      .from("produtos")
      .select("id, sku, nome, unidade_base")
      .eq("unidade_id", unidadeId)
      .eq("ativo", true)
      .order("sku")
      .order("id")
      .range(de, ate),
  ).catch((erro: Error) => {
    throw new Error(`Não foi possível carregar os produtos: ${erro.message}`);
  });
  return linhas.map((p) => ({ id: p.id, sku: p.sku, nome: p.nome, unidadeBase: p.unidade_base }));
}

export async function registrarPerdaBanco(params: {
  unidadeId: string;
  produtoId: string;
  quantidade: number;
  data: string;
  motivo: MotivoPerda;
  observacao: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_perda_estoque", {
    p_unidade_id: params.unidadeId,
    p_produto_id: params.produtoId,
    p_quantidade: params.quantidade,
    p_data: params.data,
    p_motivo: params.motivo,
    p_observacao: params.observacao,
  });
  if (error) throw erroDaFuncao(error, "Não foi possível registrar a perda");
  return data as string;
}

export async function cancelarMovimentacaoBanco(params: {
  unidadeId: string;
  movimentacaoId: string;
  motivo: string;
}): Promise<void> {
  const supabase = await createClient();
  // O id vem do navegador: confere a unidade da sessão antes (o banco confere de novo).
  const { data: mov, error: erroMov } = await supabase
    .from("estoque_movimentacoes")
    .select("id")
    .eq("id", params.movimentacaoId)
    .eq("unidade_id", params.unidadeId)
    .maybeSingle();
  if (erroMov) throw new Error(`Não foi possível localizar o lançamento: ${erroMov.message}`);
  if (!mov) throw new ErroPublico("Lançamento não encontrado nesta unidade.");

  const { error } = await supabase.rpc("cancelar_movimentacao_estoque", {
    p_movimentacao_id: params.movimentacaoId,
    p_motivo: params.motivo,
  });
  if (error) throw erroDaFuncao(error, "Não foi possível cancelar o lançamento");
}

export type ResultadoRecebimento = {
  recebido: boolean;
  recebido_dia: string | null;
  gravados: number;
  cancelados: number;
  ativos: number;
  sem_preco: number;
  pendencias: { sku: string; nome: string; motivo: string }[];
};

/** Recebimento numa transação só (cabeçalho, itens e extrato), na função do
 * banco `registrar_recebimento_pedido`. */
export async function registrarRecebimentoBanco(params: {
  pedidoId: string;
  recebido: boolean;
  observacaoEntrega: string | null;
  itensRecebidos: { sku: string; quantidadeRecebida: number | null }[];
}): Promise<ResultadoRecebimento> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_recebimento_pedido", {
    p_pedido_id: params.pedidoId,
    p_recebido: params.recebido,
    p_observacao: params.observacaoEntrega,
    p_itens: params.itensRecebidos.map((i) => ({ sku: i.sku, quantidade_recebida: i.quantidadeRecebida })),
  });
  if (error) throw erroDaFuncao(error, "Não foi possível atualizar o recebimento");
  return data as ResultadoRecebimento;
}
