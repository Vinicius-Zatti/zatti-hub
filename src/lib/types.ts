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

/** Fichas Técnicas (piloto exclusivo Zatti Teste, flag por unidade). Camada
 * é o prefixo do SKU (PRE = pré-preparo interno, VEN = item vendável) - é
 * padrão fixo e não pode ser derivado da categoria, que é só agrupamento
 * visual (ver AGENTS.md). */
export type CamadaFicha = "PRE" | "VEN";

export type StatusFicha = "rascunho" | "ativa" | "inativa";

export type UnidadeRendimentoFicha = "KG" | "LT" | "UN";

export type CategoriaFicha = {
  id: string;
  camada: CamadaFicha;
  codigo: string;
  nome: string;
  ativo: boolean;
};

/** Insumo de uma ficha: ou um produto do Estoque (`produtoSku`) ou outra
 * ficha técnica usada como sub-receita (`fichaComponenteId`) - nunca os
 * dois ao mesmo tempo. `nomeExibicao` já vem resolvido do servidor. */
export type ComponenteFicha = {
  id: string | null;
  tipo: "produto" | "ficha";
  produtoSku: string | null;
  fichaComponenteId: string | null;
  nomeExibicao: string;
  unidadeUso: string;
  quantidade: number;
  ordem: number;
  observacoes: string;
};

export type EtapaFicha = {
  ordem: number;
  descricao: string;
};

/** Custo calculado na hora da leitura (nunca guardado em coluna) - soma o
 * custo de cada componente (preço do Cadastro pro produto, custo por
 * unidade já calculado pra sub-receita) e divide pelo rendimento.
 * `completo = false` quando algum componente não tem preço cadastrado -
 * `custoTotal`/`custoPorUnidade` ainda mostram a soma parcial do que dá pra
 * calcular, nunca escondem o problema. */
export type CustoFicha = {
  custoTotal: number | null;
  custoPorUnidade: number | null;
  completo: boolean;
};

export type FichaTecnicaResumo = {
  id: string;
  sku: string;
  camada: CamadaFicha;
  categoriaId: string;
  categoriaNome: string;
  nome: string;
  rendimentoQuantidade: number;
  rendimentoUnidade: UnidadeRendimentoFicha;
  /** Só faz sentido pra camada VEN (item vendável) - preenchido na criação
   * é opcional, editável depois. PRE (receita interna) nunca pede isso. */
  precoVenda: number | null;
  status: StatusFicha;
  custo: CustoFicha;
  atualizadoEm: string;
};

export type FichaTecnica = FichaTecnicaResumo & {
  tempoPreparoMinutos: number | null;
  fotoPath: string | null;
  observacoesOperacionais: string;
  observacoesGerenciais: string;
  versao: number;
  componentes: ComponenteFicha[];
  etapas: EtapaFicha[];
  criadoPorNome: string;
  criadoEm: string;
  atualizadoPorNome: string | null;
  /** Só faz sentido pra camada VEN - ficha de Pré-preparo usada só pra
   * embalar o item na saída pro delivery. `null` = prato não linkou
   * embalagem (canais de delivery usam o mesmo custo do Salão). */
  embalagemFichaId: string | null;
  embalagemNome: string | null;
  /** Custo (com o mesmo formato de `custo`) somando a embalagem vinculada -
   * `null` quando não há embalagem linkada, e a UI cai pra `custo` mesmo
   * nos canais de delivery. */
  custoComEmbalagem: CustoFicha | null;
  /** Preços praticados dos canais de delivery - `precoVenda` (herdado de
   * `FichaTecnicaResumo`) é o preço do Salão. */
  precoVendaDeliveryProprio: number | null;
  precoVendaIfood: number | null;
  precoVenda99Food: number | null;
};

export type CanalVenda = "salao" | "delivery_proprio" | "ifood" | "99food";

/** Uma linha da seção "Preços por Canal" da ficha de Venda - preço sugerido
 * e classificação sempre recalculados na hora (nunca guardados), preço
 * praticado é o que o cliente de fato cobra em cada canal. */
export type CanalPrecoFicha = {
  canal: CanalVenda;
  label: string;
  custoPorUnidade: number | null;
  precoSugerido: number | null;
  precoPraticado: number | null;
  classificacao: ClassificacaoMargem | null;
};

/** Entrada da Calculadora de Margem Ideal (1 config por unidade). Percentuais
 * de lucro nunca são guardados - sempre derivados de faturamento, já que os
 * dois (R$ e %) têm que bater e faturamento é a referência comum. Taxa de
 * pagamento, alíquota de imposto e as comissões de marketplace já ficam
 * guardadas como fração (0,13 = 13%) - essas não têm outra forma de entrada
 * pra derivar. Comissão do iFood/99Food substitui a taxa de pagamento na
 * dedução desses canais (o marketplace já retém o pagamento, não cobra os
 * dois juntos) - ver `montarPrecosPorCanal`. */
export type ConfiguracaoFinanceira = {
  faturamentoMedioMensal: number;
  custoFixoMedioMensal: number;
  lucroDesejadoValor: number;
  taxaPagamento: number;
  aliquotaImposto: number;
  comissaoIfood: number;
  comissao99Food: number;
};

/** Resultados calculados a partir de `ConfiguracaoFinanceira` - `null`
 * quando faturamento é 0 (divisão por zero, nada pra calcular ainda).
 * `deducoesTotal` nunca é null (não depende de faturamento). */
export type MargemContribuicao = {
  percentualCustoFixo: number | null;
  lucroDesejadoPercentual: number | null;
  margemPontoEquilibrio: number | null;
  margemNecessaria: number | null;
  deducoesTotal: number;
};

/** Etiqueta ao lado do preço de venda de cada ficha VEN, comparando a
 * margem de contribuição real do produto (depois de CMV e deduções) contra
 * as duas referências da Calculadora de Margem Ideal. */
export type ClassificacaoMargem = "lucro_ajustado" | "abaixo_do_lucro" | "prejuizo";
