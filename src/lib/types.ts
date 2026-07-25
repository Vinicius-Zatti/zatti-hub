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
  /** Mesmo alerta calculado na Contagem ("Comprar emergencial" etc), pro
   * comprador ver isso também em Criar Cotação sem ter que ir conferir em
   * outra aba. */
  alerta: string;
};

export type PedidoItem = {
  sku: string;
  nome: string;
  /** Nome de Compra (como o fornecedor chama) - Pedidos Feitos sempre
   * mostra esse, é o que bate com a nota física que chega pro funcionário
   * conferir. Pode ficar vazio se o produto nunca teve isso preenchido no
   * Cadastro; nesse caso cai pro nome interno. */
  nomeCompra: string;
  unidadeBase: string;
  quantidadePedida: number;
  /** null = ainda não confirmado o recebimento - preenchido em Pedidos
   * Feitos, pode ficar diferente do pedido (fornecedor mandou menos). */
  quantidadeRecebida: number | null;
  /** Preço no Cadastro no momento em que a cotação foi salva - referência
   * pro comprador comparar contra o preço da nota nova. */
  precoAntigo: number | null;
  /** Se diferente de precoAntigo quando o pedido é salvo, atualiza o
   * Cadastro de Produtos dali pra frente (contagens antigas mantêm o preço
   * que tinham, igual já acontece em Contagem). */
  precoAtualizado: number | null;
};

/** Um pedido de compra fechado com um fornecedor específico - nasce quando
 * o comprador salva o Editor de Espelhos (antes disso é só cotação
 * calculada na hora, nunca persistida). Chave natural (unidade, fornecedor,
 * data da contagem base) pra permitir editar e resalvar o mesmo pedido. */
export type Pedido = {
  id: string;
  fornecedor: string;
  dataContagemBase: string;
  previsaoEntrega: string | null;
  observacaoEntrega: string | null;
  recebido: boolean;
  criadoEm: string;
  atualizadoEm: string;
  itens: PedidoItem[];
};
