import { Reunioes } from "@/components/clientes/reunioes";
import { prepararReuniao } from "@/lib/clientes/jornada";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { obterCliente } from "../dados";

export default async function ReunioesClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await obterCliente(id);
  const hoje = hojeIsoBrasil();
  return (
    <Reunioes
      acompanhamentoId={cliente.acompanhamento.id}
      reunioes={cliente.reunioes}
      itens={cliente.itens}
      prep={prepararReuniao(cliente, hoje)}
      etapaAtual={cliente.etapas.find((e) => e.etapa === cliente.acompanhamento.etapaAtual) ?? null}
      indicadores={cliente.indicadores}
      hoje={hoje}
    />
  );
}
