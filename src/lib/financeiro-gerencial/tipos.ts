export type TipoContaFinanceira = "banco" | "caixa" | "carteira_digital";

export type ContaFinanceira = {
  id: string;
  nome: string;
  tipo: TipoContaFinanceira;
  saldoInicial: number;
  dataSaldoInicial: string;
  ativo: boolean;
};

/** Só pro cartão de Conta Financeira (`listarContasFinanceirasComSaldos`) -
 * `saldoAtual` soma as baixas já realizadas nessa conta, `saldoProjetado`
 * soma também o saldo em aberto das parcelas atribuídas a ela. Parcela sem
 * conta definida (lançamento sem conta financeira) nunca entra na
 * projeção de conta nenhuma. */
export type ContaFinanceiraComSaldos = ContaFinanceira & {
  saldoAtual: number;
  saldoProjetado: number;
};

export type NivelCategoria = "grupo_principal" | "grupo" | "subgrupo" | "conta";

/** Liga cada conta-folha ao bucket certo do cálculo (DRE/CMV/provisões) -
 * nunca decidido por nome de texto. As 3 contas de CMO com sufixo de
 * provisão (`cmo_ferias`/`cmo_decimo_terceiro`/`cmo_multa_fgts`) só recebem
 * valor do motor de Provisões (Fase 6), nunca de lançamento manual - ver
 * `PAPEIS_DRE_SOMENTE_PROVISAO`. */
export type PapelDre =
  | "receita"
  | "deducao_receita"
  | "custo_venda_variavel"
  | "cmc_mercadorias"
  | "cmc_embalagens"
  | "cmo"
  | "cmo_ferias"
  | "cmo_decimo_terceiro"
  | "cmo_multa_fgts"
  | "custo_ocupacao"
  | "custo_administrativo"
  | "custo_comercial"
  | "custo_venda_fixo"
  | "saida_nao_operacional";

export const PAPEIS_DRE_SOMENTE_PROVISAO: readonly PapelDre[] = [
  "cmo_ferias",
  "cmo_decimo_terceiro",
  "cmo_multa_fgts",
];

export type CategoriaFinanceira = {
  id: string;
  parentId: string | null;
  nivel: NivelCategoria;
  papelDre: PapelDre | null;
  nome: string;
  codigoSistema: string | null;
  padrao: boolean;
  ordem: number;
  arquivado: boolean;
};

export type NoArvoreCategoria = CategoriaFinanceira & { filhos: NoArvoreCategoria[] };

export type TipoLancamento = "receita" | "despesa";
export type StatusParcela = "aberto" | "parcial" | "quitado" | "cancelado";

export type Parcela = {
  id: string;
  lancamentoId: string;
  numero: number;
  totalParcelas: number;
  valor: number;
  dataPrevista: string;
  contaFinanceiraId: string | null;
  status: StatusParcela;
  valorBaixado: number;
};

export type TipoBaixa = "baixa" | "estorno";

export type Baixa = {
  id: string;
  parcelaId: string;
  tipo: TipoBaixa;
  estornoDeBaixaId: string | null;
  contaFinanceiraId: string;
  valor: number;
  data: string;
  observacao: string;
  criadoPorNome: string;
  criadoEm: string;
};

export type OrigemLancamento = "comum" | "recorrencia";

export type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  categoriaId: string;
  categoriaNome: string;
  descricao: string;
  dataCompetencia: string;
  contaFinanceiraId: string | null;
  observacao: string;
  origem: OrigemLancamento;
  recorrenciaId: string | null;
  criadoPorNome: string;
  criadoEm: string;
  parcelas: Parcela[];
};

/** Uma linha manual do formulário de lançamento (Receita/Despesa) - "Vencimento
 * e Valor", sem número de parcelas perguntado: 1 linha = à vista, 2+ linhas =
 * parcelado, cada uma com data e valor próprios (ver item 6 da correção de
 * 25/08). */
export type ParcelaManualEntrada = {
  valor: number;
  dataPrevista: string;
};

/** Template que gera lançamento/parcela futuros de verdade (`fin_recorrencias`,
 * migração `20260825090000_...sql`) - nunca "pra sempre": sempre termina numa
 * data ou depois de N ocorrências. */
export type Recorrencia = {
  id: string;
  tipo: TipoLancamento;
  categoriaId: string;
  categoriaNome: string;
  descricao: string;
  valor: number;
  diaVencimento: number;
  dataInicio: string;
  dataFim: string | null;
  quantidadeOcorrencias: number | null;
  ativa: boolean;
  criadoEm: string;
};
