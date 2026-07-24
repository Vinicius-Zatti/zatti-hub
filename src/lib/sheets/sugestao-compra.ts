import { listProdutos } from "./produtos";
import { listInventario } from "./inventario";
import { ordenarGrupos } from "@/lib/pedido";
import type { SugestaoCompra } from "@/lib/types";

function parseDataBr(d: string): number {
  // "DD/MM/AAAA" -> timestamp, pra achar/ordenar contagens por data
  const [dia, mes, ano] = d.split("/").map(Number);
  if (!dia || !mes || !ano) return 0;
  return new Date(ano, mes - 1, dia).getTime();
}

/** Datas de contagem já registradas, mais recente primeiro - base pro
 * seletor "de qual contagem" em Pedidos. */
export async function datasDisponiveis(spreadsheetId: string): Promise<string[]> {
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
  opcoes: { data?: string; grupos?: string[] } = {},
  spreadsheetId: string
): Promise<{ itens: SugestaoCompra[]; dataUsada: string; gruposContadosNoDia: string[] }> {
  const [produtos, inventario] = await Promise.all([
    listProdutos(spreadsheetId),
    listInventario(spreadsheetId),
  ]);

  const dataUsada = opcoes.data || datasMaisRecente(inventario);

  const skusContadosNoDia = new Set<string>();
  const contagemPorSku = new Map<string, number>();
  const alertaPorSku = new Map<string, string>();
  for (const item of inventario) {
    if (item.data !== dataUsada) continue;
    skusContadosNoDia.add(item.sku);
    if (item.alerta) alertaPorSku.set(item.sku, item.alerta);
    if (item.quantidade === null) continue;
    contagemPorSku.set(item.sku, item.quantidade);
  }

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

  const itens: SugestaoCompra[] = [];
  for (const produto of produtos) {
    if (!produto.ativo) continue;
    if (produto.estoqueNecessarioSemana === null) continue;
    if (!gruposContados.has(produto.grupo)) continue;
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
      alerta: alertaPorSku.get(produto.sku) ?? "",
    });
  }

  return { itens, dataUsada, gruposContadosNoDia };
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
