import { Documentos } from "@/components/clientes/registros";
import { obterCliente } from "../dados";

export default async function DocumentosClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { acompanhamento, links } = await obterCliente(id);
  return <Documentos acompanhamentoId={acompanhamento.id} links={links} />;
}
