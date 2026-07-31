import { requireGestao } from "@/lib/acesso";
import { getConsolidadoPorId } from "@/lib/consolidado-vendas";
import { NovoLancamentoForm } from "@/components/novo-lancamento-form";

export const dynamic = "force-dynamic";

export default async function EditarConsolidadoPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireGestao();
  const { id } = await params;
  const consolidado = await getConsolidadoPorId(acesso.unidadeId, id);

  if (!consolidado) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
        Lançamento não encontrado - pode já ter sido removido, ou o link está errado.
      </div>
    );
  }

  return <NovoLancamentoForm existente={consolidado} />;
}
