import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGarante } from "@/lib/acesso";
import { ExecucaoChecklist } from "@/components/garante/execucao-checklist";
import { carregarExecucao } from "../../dados";

/** Um checklist do dia: cumprir (quem pode) ou ver o que foi feito, com fotos. */
export default async function ExecucaoPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await requireGarante();
  const { id } = await params;
  const execucao = await carregarExecucao(id);
  if (!execucao || execucao.unidadeId !== acesso.unidadeId) notFound();

  return (
    <div className="flex flex-col gap-3">
      <Link href="/garante" className="text-sm font-semibold text-azul-petroleo">
        ← Voltar para hoje
      </Link>
      {/* Quem pode responder o banco confere em cada RPC; aqui só abre os controles. */}
      <ExecucaoChecklist execucao={execucao} podeEditar />
    </div>
  );
}
