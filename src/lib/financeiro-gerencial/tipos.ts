export type TipoContaFinanceira = "banco" | "caixa" | "carteira_digital";

export type ContaFinanceira = {
  id: string;
  nome: string;
  tipo: TipoContaFinanceira;
  saldoInicial: number;
  dataSaldoInicial: string;
  ativo: boolean;
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

export type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  categoriaId: string;
  categoriaNome: string;
  descricao: string;
  dataCompetencia: string;
  contaFinanceiraId: string | null;
  observacao: string;
  origem: "comum";
  criadoPorNome: string;
  criadoEm: string;
  parcelas: Parcela[];
};
