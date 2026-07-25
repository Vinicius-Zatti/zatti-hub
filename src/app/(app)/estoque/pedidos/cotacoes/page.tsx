import { requireGestao } from "@/lib/acesso";
import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { getPedidoSalvo } from "@/lib/pedidos";
import { agruparPorFornecedor, ordenarFornecedores } from "@/lib/pedido";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { EditorEspelhos } from "@/components/editor-espelhos";

export const dynamic = "force-dynamic";

export default async function EditorEspelhosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const acesso = await requireGestao();
  const params = await searchParams;

  let resultado, datas, fornecedoresCadastro;
  try {
    [resultado, datas, fornecedoresCadastro] = await Promise.all([
      gerarPedido({ data: params.data }, acesso.spreadsheetId),
      datasDisponiveis(acesso.spreadsheetId),
      listFornecedores(acesso.spreadsheetId),
    ]);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  const itensPorFornecedor = agruparPorFornecedor(resultado.itens);
  const fornecedores = ordenarFornecedores(Object.keys(itensPorFornecedor));

  const pedidosSalvos = await Promise.all(
    fornecedores.map((f) => getPedidoSalvo(acesso.unidadeId, f, resultado.dataUsada))
  );
  const pedidoSalvoPorFornecedor = Object.fromEntries(fornecedores.map((f, i) => [f, pedidosSalvos[i]]));

  const pedidoMinimoPorFornecedor = Object.fromEntries(
    fornecedoresCadastro.filter((f) => f.nomeFantasia).map((f) => [f.nomeFantasia, f.pedidoMinimo])
  );

  return (
    <EditorEspelhos
      itensPorFornecedor={itensPorFornecedor}
      fornecedores={fornecedores}
      dataUsada={resultado.dataUsada}
      datasDisponiveis={datas}
      pedidoSalvoPorFornecedor={pedidoSalvoPorFornecedor}
      pedidoMinimoPorFornecedor={pedidoMinimoPorFornecedor}
      organizacaoNome={acesso.organizacaoNome}
    />
  );
}
