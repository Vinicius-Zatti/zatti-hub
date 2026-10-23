import { requireGestao } from "@/lib/acesso";
import { listConsolidados } from "@/lib/consolidado-vendas";
import { competenciasFechadas } from "@/lib/banco/financeiro-gerencial-v1";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { janelaAvisoDivergencia } from "@/lib/consolidado-divergencias";
import { DashboardVendas } from "@/components/dashboard-vendas";

export const dynamic = "force-dynamic";

export default async function DashboardConsolidadoPage() {
  const acesso = await requireGestao();
  const [lancamentos, fechados] = await Promise.all([
    listConsolidados(acesso.unidadeId),
    competenciasFechadas(acesso.unidadeId),
  ]);
  const janelaAviso = janelaAvisoDivergencia(hojeIsoBrasil(), fechados);

  return <DashboardVendas lancamentos={lancamentos} janelaAviso={janelaAviso} />;
}
