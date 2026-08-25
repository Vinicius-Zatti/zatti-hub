import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { listarContasFinanceirasComSaldos } from "@/lib/banco/financeiro-gerencial";
import { ContasFinanceirasGerenciador } from "@/components/financeiro-gerencial/contas-financeiras-gerenciador";

export const dynamic = "force-dynamic";

export default async function ContasFinanceirasPage() {
  const acesso = await requireGestaoFinanceiroGerencial();
  const contas = await listarContasFinanceirasComSaldos(acesso.unidadeId);
  return <ContasFinanceirasGerenciador contas={contas} />;
}
