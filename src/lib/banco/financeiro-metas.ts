// Metas da unidade para o farol do Painel M.E.G.A. (Financeiro V2, Fase 3, migração 20261013030000).
// Leitura por RLS (quem acessa o Financeiro da unidade); escrita só pela RPC `fin_meta_unidade_salvar`.
import { createClient } from "@/lib/supabase/server";
import { erroDeNegocio } from "@/lib/banco/financeiro-gerencial";
import type { MetaUnidade } from "@/lib/financeiro-gerencial/painel-mega";

type MetaRow = {
  vigente_desde: string;
  faturamento: number | string | null;
  cmv_percentual: number | string | null;
  custo_fixo_percentual: number | string | null;
  resultado: number | string | null;
};

function numeroOuNull(v: number | string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listarMetasUnidade(unidadeId: string): Promise<MetaUnidade[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_metas_unidade")
    .select("vigente_desde, faturamento, cmv_percentual, custo_fixo_percentual, resultado")
    .eq("unidade_id", unidadeId)
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error(`Não foi possível carregar as metas: ${error.message}`);
  return ((data as MetaRow[] | null) ?? []).map((m) => ({
    vigenteDesde: m.vigente_desde.slice(0, 10),
    faturamento: numeroOuNull(m.faturamento),
    cmvPercentual: numeroOuNull(m.cmv_percentual),
    custoFixoPercentual: numeroOuNull(m.custo_fixo_percentual),
    resultado: numeroOuNull(m.resultado),
  }));
}

/** Grava (ou corrige) as metas vigentes a partir de um mês. Gestão/master; o banco repete a checagem. */
export async function salvarMetaUnidade(params: {
  unidadeId: string;
  vigenteDesde: string;
  faturamento: number | null;
  cmvPercentual: number | null;
  custoFixoPercentual: number | null;
  resultado: number | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_meta_unidade_salvar", {
    p_unidade: params.unidadeId,
    p_vigente_desde: params.vigenteDesde,
    p_faturamento: params.faturamento,
    p_cmv_percentual: params.cmvPercentual,
    p_custo_fixo_percentual: params.custoFixoPercentual,
    p_resultado: params.resultado,
  });
  if (error) throw erroDeNegocio(error);
}
