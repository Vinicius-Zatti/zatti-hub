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
  /** Foto do preço unitário gravado na contagem escolhida. Diferente de
   * `precoUnitario`, que é o último preço salvo hoje no Cadastro e serve
   * apenas como valor inicial caso ninguém recote o item. */
  precoNaContagem: number | null;
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
  /** Foto do preço registrada na contagem que originou a cotação. Não muda
   * quando o Cadastro recebe o preço de uma compra posterior. */
  precoAntigo: number | null;
  /** Preço cotado para este fornecedor. Começa com o último valor salvo no
   * Cadastro como referência; só o preço do vencedor atualiza o Cadastro. */
  precoAtualizado: number | null;
  /** Distingue o valor inicial carregado do Cadastro de uma cotação que a
   * pessoa realmente confirmou, inclusive quando repetiu o preço antigo. */
  precoConfirmado: boolean;
  /** Verdadeiro só depois de um clique explícito em "Confirmar aqui" no
   * Editor de Espelhos - editar quantidade/preço sozinho nunca marca isso.
   * Separado de "tem quantidade confirmada" porque pra item de fornecedor
   * único a linha já nasce salva assim que a quantidade é confirmada, e sem
   * esse campo não dava pra saber se foi decisão de propósito ou só uma
   * edição no meio do caminho. */
  vencedorConfirmado: boolean;
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

/** Fechamento diário de vendas (Financeiro > Consolidado de Vendas) - só
 * existe em Postgres, sem camada de Sheets por baixo (dado 100% novo, sem
 * planilha legada pra manter compatível). */
export type ConsolidadoVenda = {
  id: string;
  data: string;
  credito: number;
  debito: number;
  pix: number;
  dinheiro: number;
  valeAlimentacao: number;
  salao: number;
  deliveryProprio: number;
  ifood: number;
  food99: number;
  totalFormasPagamento: number;
  totalCanais: number;
  totalMarketplaces: number;
  faturamentoTotal: number;
  diferenca: number;
  status: "conferido" | "divergente";
  criadoPorNome: string;
  criadoEm: string;
  atualizadoPorNome: string | null;
  atualizadoEm: string;
};
