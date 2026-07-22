import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { PedidoCompras } from "@/components/pedido-compras";
import { getAcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; grupos?: string }>;
}) {
  const acesso = await getAcessoAtual();
  const params = await searchParams;
  const grupos = params.grupos ? params.grupos.split(",").filter(Boolean) : [];

  let resultado;
  let datas;
  try {
    [resultado, datas] = await Promise.all([
      gerarPedido({ data: params.data, grupos }, acesso.spreadsheetId),
      datasDisponiveis(acesso.spreadsheetId),
    ]);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return (
    <PedidoCompras
      itens={resultado.itens}
      dataUsada={resultado.dataUsada}
      datasDisponiveis={datas}
      gruposSelecionados={grupos}
      gruposContadosNoDia={resultado.gruposContadosNoDia}
    />
  );
}
