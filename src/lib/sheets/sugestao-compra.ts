import { listProdutos } from "./produtos";
import { listInventario, calcularAlerta } from "./inventario";
import { ordenarDatasContagemBase, ordenarGrupos } from "@/lib/pedido";
import {
  quantidadePorSku,
  setoresPendentes,
  skusIncompletos,
  type AndamentoSetor,
  type EscopoSetor,
} from "@/lib/contagem/setor";
import { consolidarVariasDatas } from "@/lib/contagem/varias-datas";
import type { Produto, SugestaoCompra } from "@/lib/types";

/** Etiqueta do item sem estoque necessário da semana: ele aparece na cotação,
 * mas sem sugestão de compra, porque não há ponto de reposição pra comparar. */
export const ALERTA_SEM_PONTO_REPOSICAO = "Sem ponto de reposição";

const COMPRAR_EMERGENCIAL = "Comprar emergencial";
const FALTA_PRECO = "Falta preço no cadastro";

/** Etiqueta do item na cotação. Sem ponto de reposição, a etiqueta nova não
 * esconde as outras pendências (parecer do Codex, 24/10/2026): emergência
 * (abaixo do mínimo) fica em destaque no lugar dela e a falta de preço vem
 * junto, porque o subtotal ignora item sem preço. `calcularAlerta` olha preço
 * antes do mínimo, por isso o mínimo é conferido aqui de novo. */
export function alertaDaCotacao(
  produto: Pick<Produto, "estoqueNecessarioSemana" | "estoqueMinimo" | "precoUnitario">,
  estoqueAtual: number | null,
  alertaContagem: string
): string {
  if (produto.estoqueNecessarioSemana !== null) return alertaContagem;
  const emergencial =
    alertaContagem === COMPRAR_EMERGENCIAL ||
    (estoqueAtual !== null && produto.estoqueMinimo !== null && estoqueAtual < produto.estoqueMinimo);
  const partes = [emergencial ? COMPRAR_EMERGENCIAL : ALERTA_SEM_PONTO_REPOSICAO];
  if (produto.precoUnitario === null) partes.push(FALTA_PRECO);
  return partes.join(" · ");
}

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
 * (escolha manual da pessoa) só pode ESTREITAR esse escopo, nunca alargar.
 *
 * `datas` (13/10/2026): mais de uma contagem base junta os setores que
 * contaram em dias diferentes - regra em `lib/contagem/varias-datas.ts`. A
 * mais recente vira `dataUsada` (a contagem base que dá nome ao pedido). Com
 * uma data só, tudo fica exatamente como era. */
export async function gerarPedido(
  opcoes: {
    data?: string;
    datas?: string[];
    grupos?: string[];
    /** Snapshot do escopo da data (fonte banco, com setor cadastrado). Vazio
     * em contagem legada e em unidade na planilha, e aí vale a regra antiga
     * de escopo por grupo contado. Com várias datas, já vem consolidado. */
    escopo?: EscopoSetor[];
    andamento?: AndamentoSetor[];
  } = {},
  spreadsheetId: string | null
): Promise<{
  itens: SugestaoCompra[];
  dataUsada: string;
  datasUsadas: string[];
  gruposContadosNoDia: string[];
  setoresPendentes: string[];
}> {
  const [produtos, inventario] = await Promise.all([
    listProdutos(spreadsheetId),
    listInventario(spreadsheetId),
  ]);

  const datasUsadas = opcoes.datas?.length
    ? ordenarDatasContagemBase(Array.from(new Set(opcoes.datas)))
    : [opcoes.data || datasMaisRecente(inventario)];
  const dataUsada = datasUsadas[0];
  const escopo = opcoes.escopo ?? [];
  const andamento = opcoes.andamento ?? [];
  const consolidado = consolidarVariasDatas(inventario, datasUsadas);
  const itensDoDia = consolidado.itens;

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
    if (usaSetor) {
      if (!skusDoEscopoConcluido.has(produto.sku)) continue;
    } else if (!gruposContados.has(produto.grupo)) {
      continue;
    }
    if (gruposEscolhidos && !gruposEscolhidos.has(produto.grupo)) continue;

    // Sem ponto de reposição o item entra mesmo assim (antes sumia da cotação,
    // 23/10/2026): sem sugestão, com etiqueta, e o comprador adiciona à mão.
    const necessario = produto.estoqueNecessarioSemana;
    const estoqueAtual = contagemPorSku.get(produto.sku) ?? null;
    const quantidadeSugerida =
      estoqueAtual === null || necessario === null ? 0 : Math.max(0, necessario - estoqueAtual);
    const alertaContagem = calcularAlerta(estoqueAtual, produto.precoUnitario, produto);

    itens.push({
      sku: produto.sku,
      grupo: produto.grupo,
      nome: produto.nome,
      unidadeBase: produto.unidadeBase,
      precoUnitario: produto.precoUnitario,
      precoNaContagem: precoNaContagemPorSku.get(produto.sku) ?? null,
      estoqueAtual,
      estoqueNecessario: necessario,
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
      alerta: alertaDaCotacao(produto, estoqueAtual, alertaContagem),
      setoresQueNaoContaram: incompletosPorSku.get(produto.sku) ?? [],
      datasContagem: consolidado.datasPorSku.get(produto.sku) ?? [],
    });
  }

  return {
    itens,
    dataUsada,
    datasUsadas,
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
