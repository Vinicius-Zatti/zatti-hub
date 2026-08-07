import { requireGestao } from "@/lib/acesso";
import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listProdutos } from "@/lib/sheets/produtos";
import { listPedidosPorContagemBase } from "@/lib/pedidos";
import { agruparPorFornecedor, ordenarFornecedores } from "@/lib/pedido";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { EditorEspelhos } from "@/components/editor-espelhos";
import type { Produto, SugestaoCompra } from "@/lib/types";

export const dynamic = "force-dynamic";

function produtoParaSugestao(produto: Produto, precoNaContagem: number | null): SugestaoCompra {
  return {
    sku: produto.sku,
    grupo: produto.grupo,
    nome: produto.nome,
    unidadeBase: produto.unidadeBase,
    precoUnitario: produto.precoUnitario,
    precoNaContagem,
    estoqueAtual: null,
    estoqueNecessario: produto.estoqueNecessarioSemana ?? 0,
    quantidadeSugerida: 0,
    precisaComprar: true,
    fornecedores: [produto.fornecedor1, produto.fornecedor2, produto.fornecedor3, produto.fornecedor4].filter(
      (f) => f && f.trim() !== ""
    ),
    nomeCompra: produto.nomeCompra,
    unidadeEmbalagemFornecedor: produto.unidadeEmbalagemFornecedor,
    qtdUnidadeBasePorEmbalagem: produto.qtdUnidadeBasePorEmbalagem,
    alerta: "",
  };
}

export default async function EditorEspelhosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const acesso = await requireGestao();
  const params = await searchParams;

  let resultado, datas, fornecedoresCadastro, produtos;
  try {
    [resultado, datas, fornecedoresCadastro, produtos] = await Promise.all([
      gerarPedido({ data: params.data }, acesso.spreadsheetId),
      datasDisponiveis(acesso.spreadsheetId),
      listFornecedores(acesso.spreadsheetId),
      listProdutos(acesso.spreadsheetId),
    ]);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  const itensPorFornecedorFresco = agruparPorFornecedor(resultado.itens);

  // Pedidos já salvos nessa contagem base - garante que um fornecedor com
  // pedido salvo continue aparecendo mesmo se o recálculo fresco não achar
  // mais nenhum item precisando comprar pra ele (ex: item sem fornecedor
  // cadastrado, adicionado manualmente em Criar Cotação).
  const pedidosSalvos = await listPedidosPorContagemBase(acesso.unidadeId, resultado.dataUsada);

  const fornecedores = ordenarFornecedores(
    Array.from(new Set([...Object.keys(itensPorFornecedorFresco), ...pedidosSalvos.map((p) => p.fornecedor)]))
  );

  const skuParaProduto = new Map(produtos.map((p) => [p.sku, p]));
  const skuParaItemFresco = new Map(resultado.itens.map((item) => [item.sku, item]));

  const itensPorFornecedor: Record<string, SugestaoCompra[]> = {};
  const pedidoSalvoPorFornecedor: Record<string, (typeof pedidosSalvos)[number] | null> = {};

  for (const fornecedor of fornecedores) {
    const itensFrescos = itensPorFornecedorFresco[fornecedor] ?? [];
    const skusFrescos = new Set(itensFrescos.map((item) => item.sku));
    const pedidoDoFornecedor = pedidosSalvos.find((p) => p.fornecedor === fornecedor) ?? null;
    pedidoSalvoPorFornecedor[fornecedor] = pedidoDoFornecedor;

    const itensSalvosNaoFrescos = (pedidoDoFornecedor?.itens ?? [])
      .filter((item) => !skusFrescos.has(item.sku))
      .map((itemSalvo) => {
        const itemFresco = skuParaItemFresco.get(itemSalvo.sku);
        if (itemFresco) return itemFresco;
        const produto = skuParaProduto.get(itemSalvo.sku);
        return produto ? produtoParaSugestao(produto, itemSalvo.precoAntigo) : null;
      })
      .filter((item): item is SugestaoCompra => !!item);

    itensPorFornecedor[fornecedor] = [...itensFrescos, ...itensSalvosNaoFrescos];
  }

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
