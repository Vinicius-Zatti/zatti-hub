import { requireGestao } from "@/lib/acesso";
import { listInventario } from "@/lib/sheets/inventario";
import { listPedidosFeitos } from "@/lib/pedidos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { CalculadoraCmv } from "@/components/calculadora-cmv";

export const dynamic = "force-dynamic";

export default async function CmvPage() {
  const acesso = await requireGestao();

  let itensInventario;
  try {
    itensInventario = await listInventario(acesso.spreadsheetId);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  const pedidos = await listPedidosFeitos(acesso.unidadeId);

  return <CalculadoraCmv itensInventario={itensInventario} pedidos={pedidos} />;
}
