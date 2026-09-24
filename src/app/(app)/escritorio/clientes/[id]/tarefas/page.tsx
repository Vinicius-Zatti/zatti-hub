import { TarefasDecisoes } from "@/components/clientes/itens";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { obterCliente } from "../dados";

export default async function TarefasClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { acompanhamento, itens } = await obterCliente(id);
  return <TarefasDecisoes acompanhamentoId={acompanhamento.id} itens={itens} hoje={hojeIsoBrasil()} />;
}
