import { requireGestao } from "@/lib/acesso";
import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listProdutos } from "@/lib/sheets/produtos";
import { listPedidosPorContagemBase } from "@/lib/pedidos";
import { agruparPorFornecedor, mesclarPedidosPorFornecedorCanonico, ordenarFornecedores } from "@/lib/pedido";
import { EditorEspelhos } from "@/components/editor-espelhos";
import type { Produto, SugestaoCompra } from "@/lib/types";
import { carregarEscopoEAndamentoBanco, listarAndamentoBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import type { AndamentoSetor } from "@/lib/contagem/setor";
import { datasComplementares, escolherDatasContagem } from "@/lib/contagem/varias-datas";

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
    setoresQueNaoContaram: [],
  };
}

export default async function EditorEspelhosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string | string[] }>;
}) {
  const acesso = await requireGestao();
  const params = await searchParams;

  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  // Mesma chave de Criar Cotação: `data` com várias contagens separadas
  // por vírgula, a mais recente como base (ver `lib/contagem/varias-datas.ts`).
  // Datas extras da URL só ficam se complementam a base (setor pendente que
  // elas fecharam); unidade sem contagem por setor fica com uma data só.
  const porSetor = CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
  // Datas, andamento, fornecedores e produtos não dependem um do outro: saem
  // juntos. O inventário lido aqui é reaproveitado por `gerarPedido` (cache do request).
  const [datas, andamentoPorData, fornecedoresCadastro, produtos] = await Promise.all([
    datasDisponiveis(acesso.spreadsheetId),
    porSetor ? listarAndamentoBanco(acesso.unidadeId) : new Map<string, AndamentoSetor[]>(),
    listFornecedores(acesso.spreadsheetId),
    listProdutos(acesso.spreadsheetId),
  ]);
  const datasEscolhidas = datasComplementares(escolherDatasContagem(params.data, datas), andamentoPorData);

  const { escopo, andamento } =
    porSetor && datasEscolhidas.length > 0
      ? await carregarEscopoEAndamentoBanco(acesso.unidadeId, datasEscolhidas, andamentoPorData)
      : { escopo: [], andamento: [] };

  const resultado = await gerarPedido({ datas: datasEscolhidas, escopo, andamento }, acesso.spreadsheetId);

  const nomesFornecedoresCadastro = fornecedoresCadastro
    .map((f) => f.nomeFantasia || f.razaoSocial)
    .filter(Boolean);
  const itensPorFornecedorFresco = agruparPorFornecedor(resultado.itens, nomesFornecedoresCadastro);

  // Pedidos já salvos nessa contagem base - garante que um fornecedor com
  // pedido salvo continue aparecendo mesmo se o recálculo fresco não achar
  // mais nenhum item precisando comprar pra ele (ex: item sem fornecedor
  // cadastrado, adicionado manualmente em Criar Cotação). Reconciliado com
  // o nome canônico do cadastro antes de qualquer outro uso - sem isso,
  // Pedido salvo com o nome antigo do fornecedor (antes de uma renomeação,
  // ou com variação de espaço/maiúscula) virava um segundo bloco vazio ao
  // lado do bloco com o pedido de verdade.
  const pedidosSalvos = mesclarPedidosPorFornecedorCanonico(
    await listPedidosPorContagemBase(acesso.unidadeId, resultado.dataUsada),
    nomesFornecedoresCadastro
  );

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

  // Cadastro inteiro pro "+ Adicionar item": a pessoa pode pedir de um
  // fornecedor um item que no Cadastro está ligado a outro (ou a nenhum).
  const catalogo = produtos
    .map((produto) => skuParaItemFresco.get(produto.sku) ?? produtoParaSugestao(produto, null))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const pedidoMinimoPorFornecedor = Object.fromEntries(
    fornecedoresCadastro.filter((f) => f.nomeFantasia).map((f) => [f.nomeFantasia, f.pedidoMinimo])
  );

  return (
    <EditorEspelhos
      itensPorFornecedor={itensPorFornecedor}
      catalogo={catalogo}
      fornecedores={fornecedores}
      dataUsada={resultado.dataUsada}
      datasUsadas={resultado.datasUsadas}
      datasDisponiveis={datas}
      andamentoPorData={Object.fromEntries(andamentoPorData)}
      pedidoSalvoPorFornecedor={pedidoSalvoPorFornecedor}
      pedidoMinimoPorFornecedor={pedidoMinimoPorFornecedor}
      organizacaoNome={acesso.organizacaoNome}
      setoresPendentes={resultado.setoresPendentes}
    />
  );
}
