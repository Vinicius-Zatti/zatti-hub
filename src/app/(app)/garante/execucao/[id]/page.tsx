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

  // Mesma regra do banco (`usuario_pode_cumprir_garante` + janela das RPCs):
  // gestão e master cumprem qualquer um; operacional, o dele ou o sem
  // responsável; só até fecha_em (horário limite + tolerância de atraso
  // gravados ao iniciar), e só enquanto não foi concluído. O banco
  // confere de novo em cada resposta, foto e conclusão.
  const gestao = acesso.role === "gestao" || acesso.role === "master";
  const podeCumprir = gestao || execucao.responsavelId === null || execucao.responsavelId === acesso.userId;
  const podeEditar = podeCumprir && execucao.situacao === "em_andamento" && new Date() <= new Date(execucao.fechaEm);

  return (
    <div className="flex flex-col gap-3">
      <Link href="/garante" className="text-sm font-semibold text-azul-petroleo">
        ← Voltar para hoje
      </Link>
      <ExecucaoChecklist execucao={execucao} podeEditar={podeEditar} />
    </div>
  );
}
