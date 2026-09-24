/** Gestão de Clientes (Escritório > Clientes) - tipos e rótulos compartilhados
 * entre servidor e tela. Os valores espelham os `check` da migração
 * `20260924130000_gestao_clientes.sql`; mudar um lado exige mudar o outro. */

export const ETAPAS = [
  "venda", "ativacao", "onboarding", "mapeia", "estrutura", "garante", "acompanha", "continuidade",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ROTULO_ETAPA: Record<Etapa, string> = {
  venda: "Venda",
  ativacao: "Ativação",
  onboarding: "Onboarding",
  mapeia: "Mapeia",
  estrutura: "Estrutura",
  garante: "Garante",
  acompanha: "Acompanha",
  continuidade: "Continuidade ou encerramento",
};

export const RESPONSAVEIS = ["vinicius", "vini", "eliandro", "cliente"] as const;
export type Responsavel = (typeof RESPONSAVEIS)[number];
export const ROTULO_RESPONSAVEL: Record<Responsavel, string> = {
  vinicius: "Vinícius",
  vini: "Vini",
  eliandro: "Eliandro",
  cliente: "Cliente",
};

export const SITUACOES_ETAPA = ["nao_iniciada", "em_andamento", "concluida", "bloqueada"] as const;
export type SituacaoEtapa = (typeof SITUACOES_ETAPA)[number];
export const ROTULO_SITUACAO_ETAPA: Record<SituacaoEtapa, string> = {
  nao_iniciada: "Não iniciada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  bloqueada: "Bloqueada",
};

export const SAUDES = ["nao_avaliada", "boa", "atencao", "critica"] as const;
export type Saude = (typeof SAUDES)[number];
export const ROTULO_SAUDE: Record<Saude, string> = {
  nao_avaliada: "Não avaliada",
  boa: "Boa",
  atencao: "Atenção",
  critica: "Crítica",
};
export const TOM_SAUDE = { nao_avaliada: "neutro", boa: "bom", atencao: "atencao", critica: "critico" } as const;

export const BLOCOS_ONBOARDING = ["empresarial", "financeiro", "operacional"] as const;
export type BlocoOnboarding = (typeof BLOCOS_ONBOARDING)[number];
export const ROTULO_BLOCO: Record<BlocoOnboarding, string> = {
  empresarial: "Empresarial",
  financeiro: "Financeiro",
  operacional: "Operacional",
};

export const SITUACOES_ONBOARDING = ["confirmado", "informado", "pendente", "nao_se_aplica", "precisa_decisao"] as const;
export type SituacaoOnboarding = (typeof SITUACOES_ONBOARDING)[number];
export const ROTULO_SITUACAO_ONBOARDING: Record<SituacaoOnboarding, string> = {
  confirmado: "Confirmado",
  informado: "Informado, falta comprovar",
  pendente: "Pendente",
  nao_se_aplica: "Não se aplica",
  precisa_decisao: "Precisa de decisão",
};

export const TIPOS_ITEM = ["tarefa", "decisao", "fato", "pergunta", "risco"] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];
export const ROTULO_TIPO_ITEM: Record<TipoItem, string> = {
  tarefa: "Tarefa",
  decisao: "Decisão",
  fato: "Fato",
  pergunta: "Pergunta pendente",
  risco: "Risco",
};

export const SITUACOES_ITEM = ["aberta", "concluida", "cancelada"] as const;
export type SituacaoItem = (typeof SITUACOES_ITEM)[number];

export const DIMENSOES = ["financeiro", "cardapio", "operacional", "mercado", "marketing"] as const;
export type Dimensao = (typeof DIMENSOES)[number];
export const ROTULO_DIMENSAO: Record<Dimensao, string> = {
  financeiro: "Financeiro",
  cardapio: "Cardápio",
  operacional: "Operacional",
  mercado: "Mercado",
  marketing: "Marketing",
};

export const SITUACOES_DIAGNOSTICO = ["nao_iniciado", "em_andamento", "concluido"] as const;
export type SituacaoDiagnostico = (typeof SITUACOES_DIAGNOSTICO)[number];
export const ROTULO_SITUACAO_DIAGNOSTICO: Record<SituacaoDiagnostico, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export type ItemChecklist = { texto: string; feito: boolean };
export type Pessoa = { nome: string; papel: string };

export type Acompanhamento = {
  id: string;
  organizacaoId: string;
  organizacaoNome: string;
  objetivoContratado: string;
  metaPrincipal: string;
  etapaAtual: Etapa;
  saude: Saude;
  pessoas: Pessoa[];
  prioridades: string[];
  proximoMarco: string;
  proximoMarcoData: string | null;
  termoCalendario: string;
  cadenciaReunioes: string;
  atualizadoEm: string;
};

export type EtapaJornada = {
  id: string;
  etapa: Etapa;
  ordem: number;
  responsavel: Responsavel;
  prazo: string | null;
  situacao: SituacaoEtapa;
  evidencia: string;
  pendencia: string;
  criterioConclusao: string;
  checklist: ItemChecklist[];
};

export type ItemOnboarding = {
  id: string;
  bloco: BlocoOnboarding;
  item: string;
  resposta: string;
  situacao: SituacaoOnboarding;
  ordem: number;
};

export type Reuniao = {
  id: string;
  data: string;
  titulo: string;
  situacao: "aberta" | "fechada";
  resumo: string;
  resumoWhatsapp: string;
  pautaProxima: string;
};

export type ItemCliente = {
  id: string;
  reuniaoId: string | null;
  tipo: TipoItem;
  texto: string;
  responsavel: Responsavel | null;
  prazo: string | null;
  situacao: SituacaoItem;
  criadoEm: string;
};

export type DimensaoDiagnostico = { id: string; dimensao: Dimensao; situacao: SituacaoDiagnostico; resumo: string };
export type Indicador = { id: string; nome: string; valor: string; referencia: string; fonte: string };
export type LinkCliente = { id: string; tipo: "documento" | "acesso"; titulo: string; url: string; observacao: string };

/** Tudo o que a página de um cliente precisa, lido de uma vez. */
export type ClienteCompleto = {
  acompanhamento: Acompanhamento;
  etapas: EtapaJornada[];
  onboarding: ItemOnboarding[];
  reunioes: Reuniao[];
  itens: ItemCliente[];
  diagnostico: DimensaoDiagnostico[];
  indicadores: Indicador[];
  links: LinkCliente[];
};

/** Resultado da leitura do Google Calendar para um cliente. */
export type ProximaReuniao =
  | { ok: true; evento: { titulo: string; data: string; hora: string | null } | null }
  | { ok: false; motivo: string };
