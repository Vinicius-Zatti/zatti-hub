export type TipoFrenteTempo = "paga" | "propria";

export type FrenteTempo = {
  id: string;
  nome: string;
  tipo: TipoFrenteTempo;
  ativo: boolean;
};

/** Histórico imutável (nunca editado in-place) - correção é sempre uma linha
 * nova com `vigenteDesde` mais recente. */
export type ValorHoraTempo = {
  id: string;
  valor: number;
  vigenteDesde: string;
};

/** `valorMensal` null representa frente própria (sem meta financeira) -
 * mesmo histórico imutável do valor-hora. */
export type MetaMensalTempo = {
  id: string;
  frenteId: string;
  valorMensal: number | null;
  vigenteDesde: string;
};

export type TipoTrabalhoTempo = "reuniao" | "preparacao" | "execucao" | "followup" | "outro";
export type OrigemLancamentoTempo = "cronometro" | "manual";
export type StatusLancamentoTempo = "em_andamento" | "pausado" | "encerrado";

export type LancamentoTempo = {
  id: string;
  frenteId: string;
  frenteNome: string;
  data: string;
  horaInicio: string | null;
  horaFim: string | null;
  /** Só existe (e é a fonte de verdade das somas) quando `status = "encerrado"` -
   * nunca recalculada a partir de hora_inicio/hora_fim, que podem nem existir. */
  duracaoMinutos: number | null;
  tipoTrabalho: TipoTrabalhoTempo;
  observacao: string;
  origem: OrigemLancamentoTempo;
  status: StatusLancamentoTempo;
  iniciadoEm: string | null;
  encerradoEm: string | null;
  pausadoDesde: string | null;
  segundosPausadosAcumulados: number;
  criadoEm: string;
};

/** Uma linha do Painel mensal - meta/percentual/valorEquivalente só existem
 * pra frente paga (frente própria aparece separada, sem meta, sem % e sem
 * parecer cobrança). */
export type LinhaPainelMensalTempo = {
  frente: FrenteTempo;
  realizadoMinutos: number;
  metaValorMensal: number | null;
  metaMinutos: number | null;
  restanteMinutos: number | null;
  percentualAtingido: number | null;
  valorHoraVigente: number | null;
  valorEquivalente: number | null;
};
