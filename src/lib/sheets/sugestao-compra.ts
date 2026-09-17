import { listProdutos } from "./produtos";
import { listInventario, calcularAlerta } from "./inventario";
import { ordenarGrupos } from "@/lib/pedido";
import {
  quantidadePorSku,
  setoresPendentes,
  skusIncompletos,
  type AndamentoSetor,
  type EscopoSetor,
} from "@/lib/contagem/setor";
import type { SugestaoCompra } from "@/lib/types";

function parseDataBr(d: string): number {
  // "DD/MM/AAAA" -> timestamp, pra achar/ordenar contagens por data
  const [dia, mes, ano] = d.split("/").map(Number);
  if (!dia || !mes || !ano) return 0;
  return new Date(ano, mes - 1, dia).getTime();
}

/** Datas de contagem já registradas, mais recente primeiro - base pro
 * seletor "de qual contagem" em Pedidos. */
export async function datasDisponiveis(spreadsheetId: string | null): Promise<string[]> {
  const inventario = await listInventario(spreadsheetId);
  const datas = new Set(inventario.map((it) => it.data).filter(Boolean));
  return Array.from(datas).sort((a, b) => parseDataBr(b) - parseDataBr(a));
}

/** Gera a lista de produtos ativos com o que falta pra bater o estoque
 * necessário da semana. Traz todo mundo do escopo, não só quem precisa
 * comprar - a tabela de Pedidos usa isso pra conferência.
 *
 * O escopo é sempre limitado aos grupos que foram DE VERDADE contados na
 * data escolhida (`gruposContadosNoDia`) - se no dia 21/07 só rolou contagem
 * de Limpeza, Pedidos não mostra Proteínas/Hortifrúti/etc como "não
 * contado", porque isso nunca fez parte daquela contagem. `opcoes.grupos`
 * (escolha manual da pessoa) só pode ESTREITAR esse escopo, nunca alargar. */
export async function gerarPedido(
  opcoes: {
    data?: string;
    grupos?: string[];
    /** Snapshot do escopo da data (fonte banco, com setor cadastrado). Vazio
     * em contagem legada e em unidade na planilha, e aí vale a regra antiga
     * de escopo por grupo contado. */
    escopo?: EscopoSetor[];
    andamento?: AndamentoSetor[];
  } = {},
  spreadsheetId: string | null
): Promise<{
  itens: SugestaoCompra[];
  dataUsada: string;
  gruposContadosNoDia: string[];
  setoresPendentes: string[];
}> {
  const [produtos, inventario] = await Promise.all([
    listProdutos(spreadsheetId),
    listInventario(spreadsheetId),
  ]);

  const dataUsada = opcoes.data || datasMaisRecente(inventario);
  const escopo = opcoes.escopo ?? [];
  const andamento = opcoes.andamento ?? [];
  const itensDoDia = inventario.filter((item) => item.data === dataUsada);

  // SOMA, nunca sobrescreve. Antes desta versão, o mesmo SKU contado duas
  // vezes na mesma data deixava valendo a última linha gravada, enquanto o
  // CMV somava as duas - os dois discordavam sem ninguém perceber.
  const contagemPorSku = quantidadePorSku(itensDoDia);
  const incompletosPorSku = skusIncompletos(itensDoDia, escopo);

  const skusContadosNoDia = new Set<string>();
  const precoNaContagemPorSku = new Map<string, number | null>();
  for (const item of itensDoDia) {
    skusContadosNoDia.add(item.sku);
    precoNaContagemPorSku.set(item.sku, item.precoUnitario);
  }

  // Com setor, o escopo é o que os setores JÁ CONCLUÍDOS tinham pra contar,
  // e não os grupos que apareceram na contagem.
  const setoresConcluidos = new Set(
    andamento.filter((setor) => setor.situacao === "concluido").map((setor) => setor.setorId),
  );
  const skusDoEscopoConcluido = new Set(
    escopo.filter((linha) => setoresConcluidos.has(linha.setorId)).map((linha) => linha.sku),
  );

  // Deriva o grupo contado a partir do Cadastro de Produtos (sempre com
  // código certo: PRO, HOR...), não da coluna Grupo gravada na hora da
  // contagem - contagens antigas (de antes do app) às vezes gravaram o
  // grupo por extenso ("Proteínas") em vez do código, e comparar direto
  // contra isso zerava a lista inteira pra essas datas.
  const gruposContados = new Set<string>();
  for (const produto of produtos) {
    if (skusContadosNoDia.has(produto.sku)) gruposContados.add(produto.grupo);
  }
  const gruposContadosNoDia = ordenarGrupos(Array.from(gruposContados));

  const gruposEscolhidos =
    opcoes.grupos && opcoes.grupos.length > 0 ? new Set(opcoes.grupos) : null;

  const usaSetor = skusDoEscopoConcluido.size > 0;

  const itens: SugestaoCompra[] = [];
  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.estoqueNecessarioSemana === null) continue;
    if (usaSetor) {
      if (!skusDoEscopoConcluido.has(produto.sku)) continue;
    } else if (!gruposContados.has(produto.grupo)) {
      continue;
    }
    if (gruposEscolhidos && !gruposEscolhidos.has(produto.grupo)) continue;

    const estoqueAtual = contagemPorSku.get(produto.sku) ?? null;
    const quantidadeSugerida =
      estoqueAtual === null ? 0 : Math.max(0, produto.estoqueNecessarioSemana - estoqueAtual);

    itens.push({
      sku: produto.sku,
      grupo: produto.grupo,
      nome: produto.nome,
      unidadeBase: produto.unidadeBase,
      precoUnitario: produto.precoUnitario,
      precoNaContagem: precoNaContagemPorSku.get(produto.sku) ?? null,
      estoqueAtual,
      estoqueNecessario: produto.estoqueNecessarioSemana,
      quantidadeSugerida,
      precisaComprar: quantidadeSugerida > 0,
      fornecedores: [produto.fornecedor1, produto.fornecedor2, produto.fornecedor3, produto.fornecedor4].filter(
        (f) => f && f.trim() !== ""
      ),
      nomeCompra: produto.nomeCompra,
      unidadeEmbalagemFornecedor: produto.unidadeEmbalagemFornecedor,
      qtdUnidadeBasePorEmbalagem: produto.qtdUnidadeBasePorEmbalagem,
      // Recalculado com o estoque mínimo ATUAL do cadastro - o alerta gravado
      // na linha da Contagem fica congelado no valor de quando foi escrito
      // (achado em teste com Zatti Teste em 08/08: mínimo editado depois de a
      // contagem já existir mostrava "Comprar emergencial" errado aqui,
      // mesmo com o cadastro já corrigido). A tela de Contagens continua
      // mostrando o alerta histórico gravado - só Pedidos/Criar Cotação usa
      // o valor atual, porque é sobre decidir compra agora, não sobre o
      // registro daquele dia.
      alerta: calcularAlerta(estoqueAtual, produto.precoUnitario, produto),
      setoresQueNaoContaram: incompletosPorSku.get(produto.sku) ?? [],
    });
  }

  return {
    itens,
    dataUsada,
    gruposContadosNoDia,
    setoresPendentes: setoresPendentes(andamento),
  };
}

function datasMaisRecente(inventario: { data: string }[]): string {
  let maior = "";
  let maiorTs = -1;
  for (const it of inventario) {
    const ts = parseDataBr(it.data);
    if (ts > maiorTs) {
      maiorTs = ts;
      maior = it.data;
    }
  }
  return maior;
}
