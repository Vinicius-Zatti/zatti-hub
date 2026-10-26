import { gerarPedido, datasDisponiveis } from "@/lib/sheets/sugestao-compra";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listProdutos } from "@/lib/sheets/produtos";
import { listPedidosPorContagemBase } from "@/lib/pedidos";
import { PedidoCompras } from "@/components/pedido-compras";
import { requireGestao, redirecionarSemEdicao } from "@/lib/acesso";
import { carregarEscopoEAndamentoBanco, listarAndamentoBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import type { AndamentoSetor } from "@/lib/contagem/setor";
import { datasComplementares, escolherDatasContagem, listaDoParametro } from "@/lib/contagem/varias-datas";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { completarComItensConfirmados, configCadastroRapido } from "@/lib/cadastro-rapido";

export const dynamic = "force-dynamic";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string | string[]; grupos?: string | string[] }>;
}) {
  const acesso = await requireGestao();
  redirecionarSemEdicao(acesso, "/estoque/pedidos");
  const params = await searchParams;
  const grupos = listaDoParametro(params.grupos);

  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  // As datas precisam ser conhecidas antes, pra buscar o snapshot e o
  // andamento daquelas contagens - é o que diz se a soma está completa ou
  // parcial. `data` aceita várias contagens separadas por vírgula (13/10):
  // só entra o que existe na unidade, e a mais recente vira a contagem base.
  // Datas extras da URL só ficam se complementam a base (setor pendente que
  // elas fecharam); unidade sem contagem por setor fica com uma data só.
  const porSetor = CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
  // Datas, andamento, fornecedores e produtos não dependem um do outro: saem
  // juntos. Inventário e produtos lidos aqui são reaproveitados por
  // `gerarPedido` (cache do request), sem segunda leitura.
  const [datas, andamentoPorData, fornecedores, produtos] = await Promise.all([
    datasDisponiveis(acesso.spreadsheetId),
    porSetor ? listarAndamentoBanco(acesso.unidadeId) : new Map<string, AndamentoSetor[]>(),
    listFornecedores(acesso.spreadsheetId),
    listProdutos(acesso.spreadsheetId),
  ]);
  const datasEscolhidas = datasComplementares(escolherDatasContagem(params.data, datas), andamentoPorData);

  // Escopo e pedidos já salvos da contagem base saem juntos (fase 3 de
  // velocidade): a base é a mais recente das datas escolhidas, a mesma que
  // `gerarPedido` usa. Sem data na URL nem contagem, cai na leitura de depois.
  const dataBase = datasEscolhidas[0];
  const [{ escopo, andamento }, pedidosDaBase] = await Promise.all([
    porSetor && datasEscolhidas.length > 0
      ? carregarEscopoEAndamentoBanco(acesso.unidadeId, datasEscolhidas, andamentoPorData)
      : { escopo: [], andamento: [] },
    dataBase ? listPedidosPorContagemBase(acesso.unidadeId, dataBase) : null,
  ]);

  const resultado = await gerarPedido({ datas: datasEscolhidas, grupos, escopo, andamento }, acesso.spreadsheetId);

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
  const pedidosSalvos =
    pedidosDaBase && dataBase === resultado.dataUsada
      ? pedidosDaBase
      : await listPedidosPorContagemBase(acesso.unidadeId, resultado.dataUsada);
  const quantidadesSalvas: Record<string, number> = {};
  for (const pedido of pedidosSalvos) {
    for (const item of pedido.itens) {
      quantidadesSalvas[item.sku] = item.quantidadePedida;
    }
  }

  // Cadastro rápido (Navegação V2, piloto): produto cadastrado pelo atalho
  // não está no escopo da contagem; depois de confirmado, a linha continua na
  // tela ao recarregar. Fora do piloto a lista fica exatamente como era.
  const cadastroRapido = usaNavegacaoV2(acesso);
  const itens = cadastroRapido
    ? completarComItensConfirmados(resultado.itens, produtos, quantidadesSalvas, grupos)
    : resultado.itens;

  return (
    <PedidoCompras
      itens={itens}
      dataUsada={resultado.dataUsada}
      datasUsadas={resultado.datasUsadas}
      datasDisponiveis={datas}
      andamentoPorData={Object.fromEntries(andamentoPorData)}
      gruposSelecionados={grupos}
      gruposContadosNoDia={resultado.gruposContadosNoDia}
      organizacaoNome={acesso.organizacaoNome}
      pedidoMinimoPorFornecedor={pedidoMinimoPorFornecedor}
      podeEditar={acesso.role === "gestao" || acesso.role === "master"}
      fornecedoresCadastro={fornecedores}
      quantidadesSalvas={quantidadesSalvas}
      setoresPendentes={resultado.setoresPendentes}
      cadastroRapidoProduto={configCadastroRapido(cadastroRapido, CONTAGEM_POR_SETOR_ATIVA, acesso.fonteDadosEstoque)}
    />
  );
}
