import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias, listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import { listarTitulos } from "@/lib/banco/financeiro-documentos";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { ContasPagarReceber } from "@/components/financeiro-gerencial/contas-pagar-receber";

export const dynamic = "force-dynamic";

// Financeiro V2 (11/10/2026): lançar e dar baixa é liberado pro Operacional também,
// por isso só `requireFinanceiroGerencial` (sem exigir Gestão).
export default async function ContasPagarReceberPage() {
  const acesso = await requireFinanceiroGerencial();
  const [aPagar, aReceber, categorias, contas] = await Promise.all([
    listarTitulos(acesso.unidadeId, "despesa"),
    listarTitulos(acesso.unidadeId, "receita"),
    listarCategorias(acesso.unidadeId),
    listarContasFinanceiras(acesso.unidadeId, true),
  ]);

  return <ContasPagarReceber aPagar={aPagar} aReceber={aReceber} categorias={categorias} contas={contas} hoje={hojeIsoBrasil()} />;
}
