import { getAcessoAtual } from "@/lib/acesso";
import { listConsolidados } from "@/lib/consolidado-vendas";
import { ConsolidadoTabela } from "@/components/consolidado-tabela";

export const dynamic = "force-dynamic";

export default async function HistoricoConsolidadoPage() {
  const acesso = await getAcessoAtual();
  const lancamentos = await listConsolidados(acesso.unidadeId);

  return <ConsolidadoTabela lancamentos={lancamentos} podeEditar={acesso.role !== "operacional"} />;
}
