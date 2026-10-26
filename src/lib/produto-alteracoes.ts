import type { Produto } from "@/lib/types";

/** Gravação parcial da Edição de Dados (parecer do Codex de 26/10/2026).
 *
 * Salvar e Salvar todos gravavam a linha inteira do produto. Com a grade
 * aberta desde antes de a cotação ligar um fornecedor (RPC
 * `vincular_fornecedor_produto`), salvar outro campo devolvia a vaga vazia e
 * apagava o vínculo. Agora só vai ao banco o que mudou em relação ao produto
 * como a grade o carregou (ou como ela o salvou da última vez).
 *
 * A comparação é contra o produto CRU do banco, não contra a linha com o nome
 * de compra padrão preenchido pela grade: assim o nome de compra padrão
 * continua sendo gravado no primeiro salvar, como antes.
 *
 * Função pura, usada no servidor e testada sem banco. */

export type CamposProdutoBanco = Partial<{
  posicao: number | null;
  grupo: string;
  nome: string;
  unidade_base: string;
  preco_unitario: number | null;
  estoque_necessario_semana: number | null;
  estoque_minimo: number | null;
  nome_compra: string;
  unidade_embalagem_fornecedor: string;
  qtd_unidade_base_por_embalagem: number | null;
  preco_fornecedor: number | null;
  fornecedor_1: string;
  fornecedor_2: string;
  fornecedor_3: string;
  fornecedor_4: string;
  observacoes: string;
  ativo: boolean;
  revenda: boolean;
}>;

const COLUNAS: [keyof Produto, keyof CamposProdutoBanco][] = [
  ["posicao", "posicao"],
  ["grupo", "grupo"],
  ["nome", "nome"],
  ["unidadeBase", "unidade_base"],
  ["precoUnitario", "preco_unitario"],
  ["estoqueNecessarioSemana", "estoque_necessario_semana"],
  ["estoqueMinimo", "estoque_minimo"],
  ["nomeCompra", "nome_compra"],
  ["unidadeEmbalagemFornecedor", "unidade_embalagem_fornecedor"],
  ["qtdUnidadeBasePorEmbalagem", "qtd_unidade_base_por_embalagem"],
  ["precoFornecedor", "preco_fornecedor"],
  ["fornecedor1", "fornecedor_1"],
  ["fornecedor2", "fornecedor_2"],
  ["fornecedor3", "fornecedor_3"],
  ["fornecedor4", "fornecedor_4"],
  ["observacoes", "observacoes"],
  ["ativo", "ativo"],
  ["revenda", "revenda"],
];

/** Colunas do banco que mudaram de `original` para `atual`, com o valor novo. */
export function camposAlteradosProduto(original: Produto, atual: Produto): CamposProdutoBanco {
  const campos: Record<string, unknown> = {};
  for (const [chave, coluna] of COLUNAS) {
    const antes = original[chave] ?? null;
    const depois = atual[chave] ?? null;
    if (antes !== depois) campos[coluna] = depois;
  }
  return campos as CamposProdutoBanco;
}
