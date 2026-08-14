import { listInventario } from "@/lib/sheets/inventario";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { VisualizacaoContagens } from "@/components/visualizacao-contagens";
import { getAcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function VisualizacaoContagensPage() {
  const acesso = await getAcessoAtual();
  let itens;
  try {
    itens = await listInventario(acesso.spreadsheetId);
  } catch {
    return <ConectarPlanilha erro="Nao foi possivel carregar as contagens." />;
  }

  return <VisualizacaoContagens itens={itens} />;
}
