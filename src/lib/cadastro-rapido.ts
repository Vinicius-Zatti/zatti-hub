import { GRUPOS_FORA_DE_FICHA } from "@/lib/fichas-tecnicas";
import type { Produto, SugestaoCompra } from "@/lib/types";

/** Cadastro rápido no lugar onde se usa (Navegação V2, 24/10/2026): o produto
 * criado no modal entra direto na lista da tela aberta, sem recarregar e sem
 * perder o que já foi digitado. Funções puras de propósito - rodam no
 * componente client e no servidor, sem puxar `lib/banco/*` nem `lib/sheets/*`. */

/** Mesmo formato de `OpcaoProdutoFicha` (`listarProdutosParaFicha`). */
export type OpcaoProdutoCadastroRapido = {
  sku: string;
  nome: string;
  unidadeUso: string;
  custoUnitario: number | null;
  grupo: string;
};

/** Produto recém-criado como opção de componente de ficha técnica. Produto
 * novo ainda não tem conversão de unidade, então a unidade de uso é a base e o
 * custo é o preço unitário - igual `listarProdutosParaFicha` faria depois de
 * recarregar. `null` quando o produto nunca entra em receita (inativo ou grupo
 * de `GRUPOS_FORA_DE_FICHA`). */
export function produtoParaOpcaoFicha(produto: Produto): OpcaoProdutoCadastroRapido | null {
  if (!produto.ativo || GRUPOS_FORA_DE_FICHA.has(produto.grupo)) return null;
  return {
    sku: produto.sku,
    nome: produto.nome,
    unidadeUso: produto.unidadeBase,
    custoUnitario: produto.precoUnitario,
    grupo: produto.grupo,
  };
}

/** Acrescenta (ou troca, se o SKU já está na lista) sem duplicar. */
export function incluirPorSku<T extends { sku: string }>(lista: T[], item: T): T[] {
  return lista.some((i) => i.sku === item.sku) ? lista.map((i) => (i.sku === item.sku ? item : i)) : [...lista, item];
}

export const ALERTA_CADASTRADO_AGORA = "Cadastrado agora, sem contagem";

/** Produto que não estava na contagem como linha da Criar Cotação: estoque
 * "não contado", sem sugestão - quem comprou decide a quantidade à mão. */
export function produtoParaSugestaoCompra(produto: Produto, alerta = ALERTA_CADASTRADO_AGORA): SugestaoCompra {
  return {
    sku: produto.sku,
    grupo: produto.grupo,
    nome: produto.nome,
    unidadeBase: produto.unidadeBase,
    precoUnitario: produto.precoUnitario,
    precoNaContagem: null,
    estoqueAtual: null,
    estoqueNecessario: produto.estoqueNecessarioSemana,
    quantidadeSugerida: 0,
    precisaComprar: false,
    fornecedores: [produto.fornecedor1, produto.fornecedor2, produto.fornecedor3, produto.fornecedor4].filter(
      (f) => f && f.trim() !== "",
    ),
    nomeCompra: produto.nomeCompra,
    unidadeEmbalagemFornecedor: produto.unidadeEmbalagemFornecedor,
    qtdUnidadeBasePorEmbalagem: produto.qtdUnidadeBasePorEmbalagem,
    alerta,
    setoresQueNaoContaram: [],
    datasContagem: [],
  };
}

export const ALERTA_FORA_DA_CONTAGEM = "Fora da contagem";

/** Item confirmado na cotação que não faz parte do escopo da contagem (ex.:
 * produto cadastrado ali mesmo pelo atalho) continua aparecendo depois de
 * recarregar a página - sem isso a quantidade ficava gravada, mas a linha
 * sumia da tela. Respeita o filtro de grupos escolhido e ignora produto
 * inativo ou já presente. */
export function completarComItensConfirmados(
  itens: SugestaoCompra[],
  produtos: Produto[],
  quantidadesSalvas: Record<string, number>,
  grupos: string[] = [],
): SugestaoCompra[] {
  const presentes = new Set(itens.map((i) => i.sku));
  const filtroGrupos = grupos.length > 0 ? new Set(grupos) : null;
  const extras = produtos
    .filter(
      (p) =>
        p.ativo &&
        !presentes.has(p.sku) &&
        quantidadesSalvas[p.sku] !== undefined &&
        (!filtroGrupos || filtroGrupos.has(p.grupo)),
    )
    .map((p) => produtoParaSugestaoCompra(p, ALERTA_FORA_DA_CONTAGEM));
  return extras.length > 0 ? [...itens, ...extras] : itens;
}
