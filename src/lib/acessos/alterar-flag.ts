import { registrarAuditoria, type AcessoAtual } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";

// Liga ou desliga uma chave de módulo de uma unidade ou organização. Saiu de
// `definirExtratoEstoqueAction` (/acessos) em 24/10/2026 para Configurações >
// Módulos usar a mesma escrita e a mesma auditoria. Quem chama já passou por
// `requireMaster()`: `unidades` e `organizacoes` não têm policy de escrita, por
// isso o service role.

export type AlteracaoFlag = {
  /** Sessão do master que está alterando (já conferida com `requireMaster`). */
  acesso: AcessoAtual;
  tabela: "unidades" | "organizacoes";
  id: string;
  coluna: string;
  ligar: boolean;
  /** Ações de auditoria, ex.: "ligar_extrato_estoque" / "desligar_extrato_estoque". */
  acaoLigar: string;
  acaoDesligar: string;
  /** Nome do campo nos dados antigos/novos do log (ex.: "extratoEstoqueHabilitado"). */
  campoAuditoria: string;
  /** Recusa a mudança olhando a linha atual (ex.: extrato só com estoque no banco). */
  validar?: (linha: Record<string, unknown>) => string | null;
  /** Colunas extras que `validar` precisa ler. */
  colunasValidacao?: string[];
};

export async function alterarFlagModulo(p: AlteracaoFlag): Promise<{ ok: true; mudou: boolean } | { erro: string }> {
  const admin = createAdminClient();
  const colunas = ["id", p.coluna, ...(p.colunasValidacao ?? [])].join(", ");
  const { data, error: erroLeitura } = await admin.from(p.tabela).select(colunas).eq("id", p.id).maybeSingle();
  if (erroLeitura) return { erro: erroLeitura.message };
  const linha = data as Record<string, unknown> | null;
  if (!linha) return { erro: p.tabela === "unidades" ? "Unidade não encontrada." : "Organização não encontrada." };
  const recusa = p.validar?.(linha);
  if (recusa) return { erro: recusa };
  if (Boolean(linha[p.coluna]) === p.ligar) return { ok: true, mudou: false };

  const { error } = await admin.from(p.tabela).update({ [p.coluna]: p.ligar }).eq("id", p.id);
  if (error) return { erro: error.message };

  // O log vai na unidade alterada, não na unidade da sessão do master. Chave
  // de organização fica registrada na unidade da sessão (o log exige unidade).
  await registrarAuditoria({
    acesso: p.tabela === "unidades" ? { ...p.acesso, unidadeId: p.id } : p.acesso,
    acao: p.ligar ? p.acaoLigar : p.acaoDesligar,
    entidade: p.tabela === "unidades" ? "unidade" : "organizacao",
    entidadeId: p.id,
    dadosAntigos: { [p.campoAuditoria]: !p.ligar },
    dadosNovos: { [p.campoAuditoria]: p.ligar },
  });
  return { ok: true, mudou: true };
}

/** Recusa de ligar o extrato numa unidade com o estoque na planilha. */
export function validarExtratoEstoque(ligar: boolean) {
  return (linha: Record<string, unknown>): string | null =>
    ligar && linha.fonte_dados_estoque !== "banco"
      ? "O extrato só existe para unidade com o estoque no Zatti Hub (não na planilha)."
      : null;
}
