import { listInventario } from "@/lib/sheets/inventario";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { VisualizacaoContagens } from "@/components/visualizacao-contagens";

export const dynamic = "force-dynamic";

export default async function VisualizacaoContagensPage() {
  let itens;
  try {
    itens = await listInventario();
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return <VisualizacaoContagens itens={itens} />;
}
