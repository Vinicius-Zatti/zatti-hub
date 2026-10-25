import type { AcessoAtual } from "@/lib/acesso";
import type { FlagsModulos } from "@/lib/configuracoes/modulos";
import { createClient } from "@/lib/supabase/server";

type LinhaUnidade = {
  consolidado_vendas_habilitado: boolean;
  financeiro_gerencial_habilitado: boolean;
  financeiro_liberado_equipe: boolean;
  conciliacao_habilitada: boolean | null;
  fichas_tecnicas_habilitado: boolean;
  garante_habilitado: boolean;
  extrato_estoque_habilitado: boolean;
  fonte_dados_estoque: string;
};

/** Chaves de módulo da unidade da sessão, lidas com a sessão da pessoa (as
 * mesmas colunas que `getAcessoAtual` e `lerFlagsConciliacao` já leem). A
 * chave da Equipe é da organização e já vem no acesso. */
export async function carregarFlagsModulos(acesso: AcessoAtual): Promise<FlagsModulos> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select(
      "consolidado_vendas_habilitado, financeiro_gerencial_habilitado, financeiro_liberado_equipe, " +
        "conciliacao_habilitada, fichas_tecnicas_habilitado, garante_habilitado, extrato_estoque_habilitado, fonte_dados_estoque",
    )
    .eq("id", acesso.unidadeId)
    .maybeSingle();
  if (error || !data) throw new Error("Não foi possível ler os módulos da unidade.");
  const u = data as unknown as LinhaUnidade;
  return {
    consolidado_vendas_habilitado: u.consolidado_vendas_habilitado === true,
    financeiro_gerencial_habilitado: u.financeiro_gerencial_habilitado === true,
    financeiro_liberado_equipe: u.financeiro_liberado_equipe === true,
    conciliacao_habilitada: u.conciliacao_habilitada === true,
    fichas_tecnicas_habilitado: u.fichas_tecnicas_habilitado === true,
    garante_habilitado: u.garante_habilitado === true,
    extrato_estoque_habilitado: u.extrato_estoque_habilitado === true,
    equipe_habilitado: acesso.equipeHabilitado,
    fonteEstoqueNoBanco: u.fonte_dados_estoque === "banco",
  };
}
