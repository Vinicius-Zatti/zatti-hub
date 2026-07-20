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
  nome: string;
  unidadeBase: string;
  estoqueAtual: number;
  estoqueNecessario: number;
  quantidadeSugerida: number;
  fornecedores: string[];
};
