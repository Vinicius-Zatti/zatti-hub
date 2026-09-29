// Conciliação Inteligente V1 - tipos compartilhados (servidor e tela).
// Fatia piloto: importar e revisar, sem gravar no financeiro.

export type Direcao = "entrada" | "saida";

export type Natureza =
  | "entrada"
  | "saida"
  | "transferencia_propria"
  | "aplicacao_resgate"
  | "estorno"
  | "repasse_cartao"
  | "repasse_plataforma"
  | "desconhecido";

export type FormatoArquivo = "ofx" | "csv" | "pdf" | "imagem" | "desconhecido";
export type TipoDocumento = "extrato" | "comprovante";
export type FonteExtracao = "deterministica" | "ia";
export type ConferenciaAritmetica = "conferida" | "conferida_exceto_inicio" | "divergente" | "nao_verificavel";

/** Linha lida do arquivo, antes da identidade e da classificação. Valores
 * sempre em centavos inteiros (nunca ponto flutuante até o banco). */
export type LinhaExtraida =
  | {
      tipo: "movimento";
      posicao: number;
      data: string;
      direcao: Direcao;
      valorCentavos: number;
      descricaoOriginal: string;
      idBanco: string | null;
      conferido: boolean;
    }
  | { tipo: "saldo"; posicao: number; data: string; saldoCentavos: number }
  | { tipo: "erro"; posicao: number; codigo: string };

export type LeituraOk = {
  ok: true;
  linhas: LinhaExtraida[];
  periodoInicio: string | null;
  periodoFim: string | null;
  versaoParser: string;
  fonte: FonteExtracao;
  conferencia: ConferenciaAritmetica;
};

/** Falha global: nenhum movimento é persistido. `quarentena` indica arquivo
 * estruturalmente suspeito (senha, conteúdo ativo, limites). */
export type LeituraFalha = { ok: false; codigo: string; quarentena: boolean };

export type ResultadoLeitura = LeituraOk | LeituraFalha;

export type Confianca = "alta" | "media" | "baixa" | "nenhuma";
export type FonteSugestao =
  | "regra_unidade"
  | "fornecedor"
  | "historico"
  | "regra_organizacao"
  | "descricao"
  | "ia"
  | "sem_evidencia"
  | "natureza";

export type Sugestao = {
  categoriaId: string | null;
  confianca: Confianca;
  fonte: FonteSugestao;
  motivoCodigo: string;
  evidencias: Record<string, string | number | null>;
  regraId: string | null;
  regraVersao: number | null;
  modeloIa: string | null;
  versaoPrompt: string | null;
};

export const SEM_SUGESTAO: Sugestao = {
  categoriaId: null,
  confianca: "nenhuma",
  fonte: "sem_evidencia",
  motivoCodigo: "sem_evidencia",
  evidencias: {},
  regraId: null,
  regraVersao: null,
  modeloIa: null,
  versaoPrompt: null,
};

export type SituacaoImportacao =
  | "aguardando_arquivo"
  | "processando"
  | "concluida"
  | "parcial"
  | "falhou"
  | "quarentena"
  | "duplicada"
  | "expirada";

export type EstadoMovimento = "pendente" | "revisar" | "conciliado" | "ignorado" | "transferencia" | "mesclado";
