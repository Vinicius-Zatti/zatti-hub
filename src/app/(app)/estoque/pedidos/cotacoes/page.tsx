import { gerarPedido } from "@/lib/sheets/sugestao-compra";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { CotacoesSemana } from "@/components/cotacoes-semana";

export const dynamic = "force-dynamic";

export default async function CotacoesSemanaPage() {
  let resultado;
  try {
    resultado = await gerarPedido({});
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return <CotacoesSemana itens={resultado.itens} />;
}
