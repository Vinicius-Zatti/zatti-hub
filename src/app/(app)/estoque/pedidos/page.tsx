import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listPedidosPorContagemBase } from "@/lib/pedidos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { ErroCarregamento } from "@/components/erro-carregamento";
import { PedidoCompras } from "@/components/pedido-compras";
import { requireGestao } from "@/lib/acesso";
import { carregarEscopoEAndamentoBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import { escolherDatasContagem } from "@/lib/contagem/varias-datas";

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
    // As datas precisam ser conhecidas antes, pra buscar o snapshot e o
    // andamento daquelas contagens - é o que diz se a soma está completa ou
    // parcial. `data` aceita várias contagens separadas por vírgula (13/10):
    // só entra o que existe na unidade, e a mais recente vira a contagem base.
    datas = await datasDisponiveis(acesso.spreadsheetId);
    const datasEscolhidas = escolherDatasContagem(params.data, datas);

    const { escopo, andamento } =
      CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco" && datasEscolhidas.length > 0
        ? await carregarEscopoEAndamentoBanco(acesso.unidadeId, datasEscolhidas)
        : { escopo: [], andamento: [] };

    [resultado, fornecedores] = await Promise.all([
      gerarPedido({ datas: datasEscolhidas, grupos, escopo, andamento }, acesso.spreadsheetId),
      listFornecedores(acesso.spreadsheetId),
    ]);
  } catch {
    // Unidade no banco: leitura falhou (inclusive no meio da paginação) - erro
    // do app, nunca tela parcial. Unidade na planilha segue com o aviso antigo.
    if (acesso.fonteDadosEstoque === "banco") return <ErroCarregamento />;
    return <ConectarPlanilha erro="Nao foi possivel carregar os dados do pedido." />;
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
      datasUsadas={resultado.datasUsadas}
      datasDisponiveis={datas}
      gruposSelecionados={grupos}
      gruposContadosNoDia={resultado.gruposContadosNoDia}
      organizacaoNome={acesso.organizacaoNome}
      pedidoMinimoPorFornecedor={pedidoMinimoPorFornecedor}
      podeEditar={acesso.role === "gestao" || acesso.role === "master"}
      fornecedoresCadastro={fornecedores}
      quantidadesSalvas={quantidadesSalvas}
      setoresPendentes={resultado.setoresPendentes}
    />
  );
}
