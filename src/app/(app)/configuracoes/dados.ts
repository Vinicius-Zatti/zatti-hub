import type { AcessoAtual } from "@/lib/acesso";
import type { FlagsModulos, SituacaoContagemSetor } from "@/lib/configuracoes/modulos";
import { createClient } from "@/lib/supabase/server";

type LinhaUnidade = {
  consolidado_vendas_habilitado: boolean;
  financeiro_gerencial_habilitado: boolean;
  financeiro_liberado_equipe: boolean;
  conciliacao_habilitada: boolean | null;
  fichas_tecnicas_habilitado: boolean;
  garante_habilitado: boolean;
  extrato_estoque_habilitado: boolean;
  contagem_por_setor_habilitada: boolean;
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
        "conciliacao_habilitada, fichas_tecnicas_habilitado, garante_habilitado, extrato_estoque_habilitado, " +
        "contagem_por_setor_habilitada, fonte_dados_estoque",
    )
    .eq("id", acesso.unidadeId)
    .maybeSingle();
  // Padrão do app: leitura que falha sobe para o `error.tsx` do segmento
  // (app), o cartão de erro com unidade, tela e contato do suporte
  // (`limite-erro-carregamento.tsx`), nunca uma página 500 crua.
  if (error) {
    console.error("Falha ao ler os módulos da unidade", error.code ?? "", error.message);
    throw new Error("Não foi possível ler os módulos da unidade.");
  }
  if (!data) throw new Error("Unidade não encontrada ao ler os módulos.");
  const u = data as unknown as LinhaUnidade;
  const fonteEstoqueNoBanco = u.fonte_dados_estoque === "banco";
  return {
    consolidado_vendas_habilitado: u.consolidado_vendas_habilitado === true,
    financeiro_gerencial_habilitado: u.financeiro_gerencial_habilitado === true,
    financeiro_liberado_equipe: u.financeiro_liberado_equipe === true,
    conciliacao_habilitada: u.conciliacao_habilitada === true,
    fichas_tecnicas_habilitado: u.fichas_tecnicas_habilitado === true,
    garante_habilitado: u.garante_habilitado === true,
    extrato_estoque_habilitado: u.extrato_estoque_habilitado === true,
    contagem_por_setor_habilitada: u.contagem_por_setor_habilitada === true,
    equipe_habilitado: acesso.equipeHabilitado,
    fonteEstoqueNoBanco,
    situacaoSetor: fonteEstoqueNoBanco ? await carregarSituacaoContagemSetor(supabase, acesso.unidadeId) : null,
  };
}

/** Produtos sem setor, setores ativos e datas por setor em andamento, pela
 * mesma função que o banco usa para travar a troca. Falha aqui não derruba a
 * tela: o cartão fica sem o aviso e o banco ainda recusa a troca indevida. */
async function carregarSituacaoContagemSetor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string,
): Promise<SituacaoContagemSetor | null> {
  const { data, error } = await supabase.rpc("situacao_contagem_por_setor", { p_unidade_id: unidadeId });
  if (error || !data) {
    if (error) console.error("Falha ao ler a situação da contagem por setor", error.code ?? "", error.message);
    return null;
  }
  const s = data as { produtosSemSetor?: number; setoresAtivos?: number; emAndamento?: string[] };
  return {
    produtosSemSetor: Number(s.produtosSemSetor ?? 0),
    setoresAtivos: Number(s.setoresAtivos ?? 0),
    emAndamento: Array.isArray(s.emAndamento) ? s.emAndamento : [],
  };
}
