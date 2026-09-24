import { EscritorioVirtual } from "@/components/escritorio/escritorio-virtual";
import { requireEscritorio } from "@/lib/acesso";
import { montarEscritorio } from "@/lib/escritorio/escritorio";

export default async function EscritorioPage() {
  await requireEscritorio();
  const { salas, atualizadoEm } = montarEscritorio();

  return <EscritorioVirtual salas={salas} atualizadoEm={atualizadoEm} />;
}
