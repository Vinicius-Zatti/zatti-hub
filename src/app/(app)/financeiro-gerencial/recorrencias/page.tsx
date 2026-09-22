import { requireFinanceiroGerencial } from "@/lib/acesso";
import { carregarBaseFinanceira, listarRecorrenciasResumo } from "@/lib/banco/financeiro-gerencial-v1";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { RecorrenciasVisualizacao } from "@/components/financeiro-gerencial/recorrencias-visualizacao";

export const dynamic = "force-dynamic";

// Criar recorrência continua no formulário de Receitas/Despesas; aqui é
// acompanhar e encerrar (Gestão/master).
export default async function RecorrenciasPage() {
  const acesso = await requireFinanceiroGerencial();
  const { lancamentos, baixas } = await carregarBaseFinanceira(acesso.unidadeId);
  const recorrencias = await listarRecorrenciasResumo(acesso.unidadeId, lancamentos, baixas);
  return <RecorrenciasVisualizacao recorrencias={recorrencias} podeGerir={acesso.role !== "operacional"} hoje={hojeIsoBrasil()} />;
}
