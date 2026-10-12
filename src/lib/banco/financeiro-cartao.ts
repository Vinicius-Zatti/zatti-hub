// Cartão de crédito (Financeiro V2, F3): leitura das faturas e chamadas às RPCs
// `fin_fatura_pagar` e `fin_fatura_alterar_vencimento` (migração 20261011154000).
import { createClient } from "@/lib/supabase/server";
import { buscarTudo, buscarTudoEmLotes } from "@/lib/banco/paginacao";
import { erroDeNegocio } from "@/lib/banco/financeiro-gerencial";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { situacaoFatura, totaisFatura, type Fatura, type ItemFatura, type PagamentoFatura } from "@/lib/financeiro-gerencial/cartao";
import type { StatusParcela, TipoBaixa } from "@/lib/financeiro-gerencial/tipos";

type FaturaRow = { id: string; conta_cartao_id: string; referencia: string; fechamento: string; vencimento: string };

type ParcelaFaturaRow = {
  id: string;
  fatura_id: string;
  numero: number;
  total_parcelas: number;
  valor: number;
  status: StatusParcela;
  fin_lancamentos: {
    id: string;
    descricao: string;
    data_competencia: string;
    criado_em: string;
    fin_categorias: { nome: string } | null;
  };
};

type PagamentoRow = { id: string; fatura_id: string; conta_financeira_id: string; valor: number; data: string };

/** Faturas do cartão (ou de todos os cartões), da mais recente para a mais antiga, com compras,
 * pagamentos, totais e situação. Parcela cancelada não aparece nem soma. */
export async function listarFaturas(unidadeId: string, contaCartaoId?: string): Promise<Fatura[]> {
  const supabase = await createClient();
  const faturas = await buscarTudo<FaturaRow>((de, ate) => {
    let query = supabase
      .from("fin_faturas_cartao")
      .select("id, conta_cartao_id, referencia, fechamento, vencimento")
      .eq("unidade_id", unidadeId);
    if (contaCartaoId) query = query.eq("conta_cartao_id", contaCartaoId);
    return query.order("referencia", { ascending: false }).order("id").range(de, ate);
  });
  if (faturas.length === 0) return [];
  const ids = faturas.map((f) => f.id);

  const [parcelas, pagamentos] = await Promise.all([
    buscarTudoEmLotes<ParcelaFaturaRow>(ids, (lote, de, ate) =>
      supabase
        .from("fin_parcelas")
        .select(
          "id, fatura_id, numero, total_parcelas, valor, status, fin_lancamentos!inner(id, descricao, data_competencia, criado_em, fin_categorias(nome))",
        )
        .eq("unidade_id", unidadeId)
        .in("fatura_id", lote)
        .neq("status", "cancelado")
        .order("id")
        .range(de, ate),
    ),
    buscarTudoEmLotes<PagamentoRow>(ids, (lote, de, ate) =>
      supabase
        .from("fin_fatura_pagamentos")
        .select("id, fatura_id, conta_financeira_id, valor, data")
        .eq("unidade_id", unidadeId)
        .in("fatura_id", lote)
        .order("id")
        .range(de, ate),
    ),
  ]);

  const baixas = await buscarTudoEmLotes<{ parcela_id: string; valor: number; tipo: TipoBaixa }>(
    parcelas.map((p) => p.id),
    (lote, de, ate) =>
      supabase.from("fin_baixas").select("id, parcela_id, valor, tipo").eq("unidade_id", unidadeId).in("parcela_id", lote).order("id").range(de, ate),
  );
  const pagoPorParcela = new Map<string, number>();
  for (const b of baixas) {
    const sinal = b.tipo === "estorno" ? -1 : 1;
    pagoPorParcela.set(b.parcela_id, (pagoPorParcela.get(b.parcela_id) ?? 0) + sinal * Math.round(Number(b.valor) * 100));
  }

  const itensPorFatura = new Map<string, ItemFatura[]>();
  const criadoEmPorParcela = new Map<string, string>();
  for (const p of parcelas) {
    const lista = itensPorFatura.get(p.fatura_id) ?? [];
    lista.push({
      parcelaId: p.id,
      lancamentoId: p.fin_lancamentos.id,
      dataCompra: p.fin_lancamentos.data_competencia,
      descricao: p.fin_lancamentos.descricao,
      planoDeContas: p.fin_lancamentos.fin_categorias?.nome ?? "-",
      numero: p.numero,
      totalParcelas: p.total_parcelas,
      valor: Number(p.valor),
      pago: (pagoPorParcela.get(p.id) ?? 0) / 100,
      status: p.status,
    });
    criadoEmPorParcela.set(p.id, p.fin_lancamentos.criado_em);
    itensPorFatura.set(p.fatura_id, lista);
  }

  const pagamentosPorFatura = new Map<string, PagamentoFatura[]>();
  for (const pg of pagamentos) {
    const lista = pagamentosPorFatura.get(pg.fatura_id) ?? [];
    lista.push({ id: pg.id, contaFinanceiraId: pg.conta_financeira_id, valor: Number(pg.valor), data: pg.data });
    pagamentosPorFatura.set(pg.fatura_id, lista);
  }

  const hoje = hojeIsoBrasil();
  return faturas.map((f) => {
    // Mesma ordem em que o pagamento baixa: compra mais antiga primeiro.
    const criadoEm = (i: ItemFatura) => criadoEmPorParcela.get(i.parcelaId) ?? "";
    const itens = (itensPorFatura.get(f.id) ?? []).sort(
      (a, b) => a.dataCompra.localeCompare(b.dataCompra) || criadoEm(a).localeCompare(criadoEm(b)) || a.parcelaId.localeCompare(b.parcelaId),
    );
    const totais = totaisFatura(itens);
    return {
      id: f.id,
      contaCartaoId: f.conta_cartao_id,
      referencia: f.referencia,
      fechamento: f.fechamento,
      vencimento: f.vencimento,
      ...totais,
      situacao: situacaoFatura({ fechamento: f.fechamento, vencimento: f.vencimento, ...totais }, hoje),
      itens,
      pagamentos: (pagamentosPorFatura.get(f.id) ?? []).sort((a, b) => a.data.localeCompare(b.data)),
    };
  });
}

/** Paga a fatura (total ou parcial) pela conta bancária: o banco baixa as compras da mais antiga
 * para a mais nova. A chave idempotente impede pagar duas vezes no reenvio. */
export async function pagarFatura(params: {
  unidadeId: string;
  faturaId: string;
  contaFinanceiraId: string;
  data: string;
  valor: number;
  chave: string;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_fatura_pagar", {
    p: {
      unidade: params.unidadeId,
      fatura_id: params.faturaId,
      conta_financeira_id: params.contaFinanceiraId,
      data: params.data,
      valor: Math.round(params.valor * 100),
      chave: params.chave,
    },
  });
  if (error) throw erroDeNegocio(error);
  return data as string;
}

/** Corrige o vencimento real da fatura: a fatura e as parcelas dela mudam juntas (Gestão/master). */
export async function alterarVencimentoFatura(params: { unidadeId: string; faturaId: string; vencimento: string }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_fatura_alterar_vencimento", {
    p_unidade: params.unidadeId,
    p_fatura: params.faturaId,
    p_vencimento: params.vencimento,
  });
  if (error) throw erroDeNegocio(error);
}
