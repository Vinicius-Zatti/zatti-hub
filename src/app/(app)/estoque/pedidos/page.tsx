import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { getPedidoSalvo } from "@/lib/pedidos";
import { agruparPorFornecedor, ordenarFornecedores } from "@/lib/pedido";
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

  // Quantidade que já foi salva (Salvar/Salvar tudo) pra essa contagem base -
  // sem isso, toda vez que a página recarrega ela recalcula a sugestão do
  // zero e o que foi combinado com o fornecedor "some" da tela, mesmo tendo
  // sido salvo certinho (o Editor de Espelhos continua mostrando certo,
  // porque só ele lia esse dado - Criar Cotação nunca lia). Uma linha por SKU
  // basta: o override já é global por SKU aqui, igual o resto da tela.
  const quantidadesSalvas: Record<string, number> = {};
  for (const pedido of pedidosSalvos) {
    if (!pedido) continue;
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
      previsaoEntregaPorFornecedor={previsaoEntregaPorFornecedor}
      podeSalvar={acesso.role === "gestao" || acesso.role === "master"}
      fornecedoresCadastro={fornecedores}
      quantidadesSalvas={quantidadesSalvas}
    />
  );
}
