import { Jornada } from "@/components/clientes/jornada";
import { obterCliente } from "../dados";

export default async function JornadaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { acompanhamento, etapas, onboarding } = await obterCliente(id);
  return <Jornada acompanhamentoId={acompanhamento.id} etapaAtual={acompanhamento.etapaAtual} etapas={etapas} onboarding={onboarding} />;
}
