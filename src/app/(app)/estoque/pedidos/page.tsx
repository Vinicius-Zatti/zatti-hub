import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listPedidosPorContagemBase } from "@/lib/pedidos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { PedidoCompras } from "@/components/pedido-compras";
import { requireGestao } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; grupos?: string }>;
}) {
  const acesso = await requireGestao();
  const params = await searchParams;
  const grupos = params.grupos ? params.grupos.split(",").filter(Boolean) : [];

  let resultado;
  let datas;
  let fornecedores;
  try {
    [resultado, datas, fornecedores] = await Promise.all([
      gerarPedido({ data: params.data, grupos }, acesso.spreadsheetId),
      datasDisponiveis(acesso.spreadsheetId),
      listFornecedores(acesso.spreadsheetId),
    ]);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  const pedidoMinimoPorFornecedor = Object.fromEntries(
    fornecedores
      .filter((f) => f.nomeFantasia)
      .map((f) => [f.nomeFantasia, f.pedidoMinimo]),
  );

  // Quantidade já confirmada pra essa contagem base - sem isso, toda vez que
  // a página recarrega ela recalcula a sugestão do zero e o que foi
  // combinado com o fornecedor "some" da tela, mesmo tendo sido gravado
  // certinho. Uma linha por SKU basta: o override é global por SKU aqui,
  // igual o resto da tela (quantidade é a mesma não importa qual fornecedor
  // acaba fornecendo).
  const pedidosSalvos = await listPedidosPorContagemBase(acesso.unidadeId, resultado.dataUsada);
  const quantidadesSalvas: Record<string, number> = {};
  for (const pedido of pedidosSalvos) {
    for (const item of pedido.itens) {
      quantidadesSalvas[item.sku] = item.quantidadePedida;
    }
  }

  return (
    <PedidoCompras
      itens={resultado.itens}
      dataUsada={resultado.dataUsada}
      datasDisponiveis={datas}
      gruposSelecionados={grupos}
      gruposContadosNoDia={resultado.gruposContadosNoDia}
      organizacaoNome={acesso.organizacaoNome}
      pedidoMinimoPorFornecedor={pedidoMinimoPorFornecedor}
      podeEditar={acesso.role === "gestao" || acesso.role === "master"}
      fornecedoresCadastro={fornecedores}
      quantidadesSalvas={quantidadesSalvas}
    />
  );
}
