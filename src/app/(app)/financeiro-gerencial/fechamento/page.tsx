import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { listarAuditoriaFinanceiro, listarFechamentos } from "@/lib/banco/financeiro-gerencial-v1";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { FechamentoVisualizacao } from "@/components/financeiro-gerencial/fechamento-visualizacao";

export const dynamic = "force-dynamic";

export default async function FechamentoPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const acesso = await requireGestaoFinanceiroGerencial();
  const { ano: anoParam } = await searchParams;
  const ano = anoParam && /^\d{4}$/.test(anoParam) ? Number(anoParam) : Number(hojeIsoBrasil().slice(0, 4));

  const [fechamentos, auditoria] = await Promise.all([listarFechamentos(acesso.unidadeId), listarAuditoriaFinanceiro(acesso.unidadeId)]);

  return <FechamentoVisualizacao ano={ano} fechamentos={fechamentos.filter((f) => f.competencia.startsWith(`${ano}-`))} auditoria={auditoria} />;
}
