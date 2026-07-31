import { requireGestao } from "@/lib/acesso";
import { listConsolidados } from "@/lib/consolidado-vendas";
import { DashboardVendas } from "@/components/dashboard-vendas";

export const dynamic = "force-dynamic";

export default async function DashboardConsolidadoPage() {
  const acesso = await requireGestao();
  const lancamentos = await listConsolidados(acesso.unidadeId);

  return <DashboardVendas lancamentos={lancamentos} />;
}
