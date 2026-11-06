/** Painel do Instagram (05/11/2026): tipos do contrato Vini <-> Hub
 * (`_execucao/zatti-hub/painel-instagram-v1-contrato.md` no Cérebro do Gestor).
 * Só os números do perfil de Vinícius; nenhum dado de cliente. O Vini é dono
 * dos dados; o Hub lê e pede alterações. Arquivo neutro (sem server-only). */

export const PERIODOS = ["7", "30", "90"] as const;
export type Periodo = (typeof PERIODOS)[number];

export type PalavraDirect = {
  codigo: string;
  /** null = post agendado pelo publicador, ainda sem link. */
  link: string | null;
  post: string;
  /** null = qualquer comentário no post dispara o Direct. */
  palavra: string | null;
  direct: string;
  linkEntrega: string | null;
  envios: number | null;
  ativa: boolean;
  origem: "hub" | "base";
};

export type EnvioDirect = { em: number | null; usuario: string; palavra: string | null; codigo: string };

export type Automacao = {
  ligada: boolean;
  pausadaAte: number | null;
  enviosHoje: number | null;
  tempoRespostaSeg: number | null;
  registroDesde: string | null;
  palavras: PalavraDirect[];
  ultimos: EnvioDirect[];
};

export type NumerosPeriodo = {
  alcance: number | null;
  interacoes: number | null;
  salvamentos: number | null;
  seguidoresNovos: number | null;
  /** interações / alcance x 100 (já em pontos percentuais). */
  engajamento: number | null;
};
export type DadosPeriodo = NumerosPeriodo & { anterior: NumerosPeriodo | null };

export type DiaMetricas = { dia: string; alcance: number | null };

export type FormatoMetricas = { formato: string; posts: number; viewsPorPost: number | null; salvamentosPorPost: number | null };

export type NumerosPerfil = {
  postsPorSemana: number | null;
  viewsPorPost: number | null;
  interacoesPorPost: number | null;
};

export type Metricas = {
  atualizadoEm: number | null;
  periodos: Record<Periodo, DadosPeriodo | null>;
  alcance90Somado: boolean;
  porDia: DiaMetricas[];
  voce: NumerosPerfil;
  formatos: FormatoMetricas[];
};

export type PerfilConcorrente = NumerosPerfil & { perfil: string };
export type Concorrencia = { lidoEm: string | null; perfis: PerfilConcorrente[] };

export type LeituraInstagram = { automacao: Automacao; metricas: Metricas; concorrencia: Concorrencia };

/** Peça do Calendário de Conteúdo mostrada em "O que postar essa semana". */
export type PecaSemana = { id: string; data: string; hora: string | null; formato: string; titulo: string; status: string };
