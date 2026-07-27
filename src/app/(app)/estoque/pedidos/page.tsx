import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { getPedidoSalvo } from "@/lib/pedidos";
import { agruparPorFornecedor, ordenarFornecedores } from "@/lib/pedido";
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

  // Previsão de entrega já combinada no Editor de Espelhos (se existir) -
  // salvar daqui não pode zerar isso sem querer.
  const porFornecedor = agruparPorFornecedor(resultado.itens);
  const fornecedoresDoPedido = ordenarFornecedores(Object.keys(porFornecedor));
  const pedidosSalvos = await Promise.all(
    fornecedoresDoPedido.map((f) => getPedidoSalvo(acesso.unidadeId, f, resultado.dataUsada)),
  );
  const previsaoEntregaPorFornecedor = Object.fromEntries(
    fornecedoresDoPedido.map((f, i) => [f, pedidosSalvos[i]?.previsaoEntrega ?? null]),
  );

  return (
    <PedidoCompras
      itens={resultado.itens}
      dataUsada={resultado.dataUsada}
      datasDisponiveis={datas}
      gruposSelecionados={grupos}
      gruposContadosNoDia={resultado.gruposContadosNoDia}
      organizacaoNome={acesso.organizacaoNome}
      pedidoMinimoPorFornecedor={pedidoMinimoPorFornecedor}
      previsaoEntregaPorFornecedor={previsaoEntregaPorFornecedor}
      podeSalvar={acesso.role === "gestao" || acesso.role === "master"}
    />
  );
}
