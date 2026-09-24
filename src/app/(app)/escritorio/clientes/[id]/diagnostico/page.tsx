import { Diagnostico } from "@/components/clientes/registros";
import { obterCliente } from "../dados";

export default async function DiagnosticoClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { acompanhamento, diagnostico } = await obterCliente(id);
  return <Diagnostico acompanhamentoId={acompanhamento.id} dimensoes={diagnostico} />;
}
