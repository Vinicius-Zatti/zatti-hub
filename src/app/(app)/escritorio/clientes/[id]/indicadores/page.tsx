import { Indicadores } from "@/components/clientes/registros";
import { obterCliente } from "../dados";

export default async function IndicadoresClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { acompanhamento, indicadores } = await obterCliente(id);
  return <Indicadores acompanhamentoId={acompanhamento.id} indicadores={indicadores} />;
}
