/** Painel de operação (16/10/2026): tipos do contrato Vini <-> Hub
 * (`_execucao/zatti-hub/painel-operacao-v1-contrato.md` no Cérebro do Gestor).
 * O Vini é dono dos dados; o Hub só lê e pede alterações. Arquivo neutro
 * (sem server-only): serve à página, às actions e aos componentes client. */

export const TIPOS_ITEM = ["demanda", "ata", "pauta", "acao", "alerta"] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];

export const COLUNAS = ["nova", "andamento", "esperando_cliente", "esperando_voce", "resolvida"] as const;
export type Coluna = (typeof COLUNAS)[number];

export const ACOES_ITEM = ["aprovar", "aprovar_sem_enviar", "recusar", "enviar_texto", "resolver", "nao_demanda"] as const;
export type AcaoItem = (typeof ACOES_ITEM)[number];

/** Corpo de POST /zatti-hub/operacao/acao: as ações do cartão + mover e nota. */
export const ACOES_POST = ["coluna", "nota", ...ACOES_ITEM] as const;
export type AcaoPost = (typeof ACOES_POST)[number];

export const ESTADOS_TAREFA = ["a_fazer", "fazendo", "feito"] as const;
export type EstadoTarefa = (typeof ESTADOS_TAREFA)[number];

export const LADOS_TAREFA = ["cliente", "zatti", "indefinido"] as const;
export type LadoTarefa = (typeof LADOS_TAREFA)[number];

export type MensagemDemanda = { autor: string; texto: string; em: number | null; equipe: boolean };
export type RespostaDemanda = { texto: string; situacao: string; vez: number | null; motivo: string | null };
export type TarefaAta = { responsavel: string; lado: LadoTarefa; tarefa: string; prazo: string };

export type DetalheItem =
  | { tipo: "demanda"; autor: string; canalNome: string | null; area: string | null; mensagens: MensagemDemanda[]; resposta: RespostaDemanda | null }
  | { tipo: "ata"; reuniaoEm: string | null; resumo: string; decisoes: string[]; tarefas: TarefaAta[]; mensagem: string; canalNome: string | null }
  | { tipo: "pauta"; reuniaoEm: string | null; mensagem: string; canalNome: string | null }
  | { tipo: "acao" | "alerta"; texto: string };

/** Datas em ms (o Vini grava `Date.now()`); `reuniaoEm` vira AAAA-MM-DD no fuso de Brasília. */
export type ItemOperacao = {
  chave: string;
  tipo: TipoItem;
  subtipo: string | null;
  codigo: string;
  cliente: string | null;
  sigla: string | null;
  titulo: string;
  resumo: string;
  coluna: Coluna;
  colunaManual: boolean;
  criadoEm: number | null;
  desdeEm: number | null;
  encerradoEm: number | null;
  nota: string;
  acoes: AcaoItem[];
  detalhe: DetalheItem;
};

export type TarefaCliente = {
  id: string;
  ataCodigo: string;
  cliente: string | null;
  sigla: string | null;
  responsavel: string;
  lado: LadoTarefa;
  tarefa: string;
  prazo: string;
  estado: EstadoTarefa;
  atualizadoEm: number | null;
  reuniaoEm: string | null;
};

export type LeituraOperacao = { geradoEm: number | null; itens: ItemOperacao[]; tarefas: TarefaCliente[] };

export const ROTULO_COLUNA: Record<Coluna, string> = {
  nova: "Nova",
  andamento: "Em andamento",
  esperando_cliente: "Esperando cliente",
  esperando_voce: "Esperando você",
  resolvida: "Resolvida",
};

export const ROTULO_TIPO: Record<TipoItem, string> = {
  demanda: "Demanda",
  ata: "Ata",
  pauta: "Pauta",
  acao: "Ação",
  alerta: "Alerta",
};

export const ROTULO_ESTADO_TAREFA: Record<EstadoTarefa, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  feito: "Feito",
};

export const ROTULO_LADO: Record<LadoTarefa, string> = {
  cliente: "Cliente",
  zatti: "Zatti",
  indefinido: "Sem lado definido",
};
