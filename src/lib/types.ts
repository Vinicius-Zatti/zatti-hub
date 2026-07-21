export type Produto = {
  sku: string;
  posicao: number | null;
  grupo: string;
  nome: string;
  unidadeBase: string;
  precoUnitario: number | null;
  estoqueNecessarioSemana: number | null;
  estoqueMinimo: number | null;
  nomeCompra: string;
  unidadeEmbalagemFornecedor: string;
  qtdUnidadeBasePorEmbalagem: number | null;
  precoFornecedor: number | null;
  fornecedor1: string;
  fornecedor2: string;
  fornecedor3: string;
  fornecedor4: string;
  observacoes: string;
  ativo: boolean;
};

export type ItemInventario = {
  data: string;
  mes: string;
  sku: string;
  grupo: string;
  nome: string;
  unidadeBase: string;
  quantidade: number | null;
  precoUnitario: number | null;
  total: number | null;
  alerta: string;
};

export type ItemPendente = {
  nome: string;
  unidadeBase: string;
  ultimaContagem: string;
};

export type Fornecedor = {
  codigo: string;
  razaoSocial: string;
  nomeFantasia: string;
  /** Códigos de grupo (PRO, HOR, BEB...) que esse fornecedor atende. Um
   * fornecedor pode atender mais de um grupo. */
  grupos: string[];
  nomeVendedor: string;
  whatsapp: string;
  condicoesPagamento: string;
  prazoBoleto: string;
  limiteCredito: number | null;
  pedidoMinimo: number | null;
  diasEntrega: string;
  observacoes: string;
};

export type SugestaoCompra = {
  sku: string;
  grupo: string;
  nome: string;
  unidadeBase: string;
  precoUnitario: number | null;
  /** null = produto ativo mas sem contagem na data escolhida (não dá pra
   * saber o estoque atual, não confundir com estoque zerado). */
  estoqueAtual: number | null;
  estoqueNecessario: number;
  quantidadeSugerida: number;
  precisaComprar: boolean;
  fornecedores: string[];
  /** Pra visualização "Nome de Compra" em Pedidos: nome que o fornecedor
   * usa, unidade de embalagem dele (CX, FD, PCT...) e quantas unidades base
   * cabem numa embalagem - pra converter "15 latas" em "2 fardos". */
  nomeCompra: string;
  unidadeEmbalagemFornecedor: string;
  qtdUnidadeBasePorEmbalagem: number | null;
};
