import "server-only";
import { redirect } from "next/navigation";
import { requireFinanceiroGerencial, temPermissao, type AcessoAtual } from "@/lib/acesso";
import { lerFlagsConciliacao, type FlagsConciliacao } from "@/lib/banco/conciliacao";

/** Barreira da Conciliação: Financeiro Gerencial liberado E flag da unidade.
 * Repetida em `usuario_pode_usar_conciliacao` no banco (última barreira).
 * A flag é lida à parte do `getAcessoAtual` de propósito: sem a migração no
 * banco, a Conciliação fica desligada e o resto do app segue normal. */
export async function requireConciliacao(): Promise<{ acesso: AcessoAtual; flags: FlagsConciliacao }> {
  const acesso = await requireFinanceiroGerencial();
  // Conciliação é trabalho: exige editar o Financeiro (mesma regra do banco, fase 6).
  if (!temPermissao(acesso, "financeiro", "editar")) redirect("/financeiro-gerencial/visao-geral");
  const flags = await lerFlagsConciliacao(acesso.unidadeId);
  if (!flags.habilitada) redirect("/financeiro-gerencial/visao-geral");
  return { acesso, flags };
}
