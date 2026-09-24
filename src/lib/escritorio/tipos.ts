/** Escritório Virtual da Zatti - tipos compartilhados.
 *
 * A estrutura do Time de IA vive em quatro arquivos de dado, cada um com uma
 * responsabilidade só, e a tela lê tudo por `montarEscritorio()`:
 * - `estrutura.ts`: salas e posições (quem responde a quem, quem ocupa).
 * - `ocupantes.ts`: pessoas, inteligências e arquétipos de referência.
 * - `responsabilidades.ts`: missão, responsabilidades, assuntos e resultados.
 * - `estado.ts`: nível, situação, entregas e alertas (atualizado à mão). */

/** Separação obrigatória: nada da Horizzon se mistura com a Zatti. */
export type Empresa = "zatti" | "horizzon";

export type TipoSala = "ceo" | "recepcao" | "diretoria" | "nucleo";

/** Três times que não se misturam: a empresa Zatti, os clientes da Zatti e a Horizzon. */
export type GrupoSala = "topo" | "empresa" | "clientes" | "horizzon";

export type Sala = {
  id: string;
  nome: string;
  empresa: Empresa;
  tipo: TipoSala;
  grupo: GrupoSala;
  /** Frase curta que responde "o que essa sala resolve". */
  resumo: string;
};

/** `null` = posição vaga. `agente` = agente de IA identificado pelo próprio cargo. */
export type OcupanteId = "vinicius" | "vini" | "bia" | "antonio" | "agente";

export type Posicao = {
  id: string;
  cargo: string;
  salaId: string;
  ocupanteId: OcupanteId | null;
  arquetipoId: string | null;
  /** Id da posição a quem responde. `null` só no topo (CEO e responsável final da Horizzon). */
  reportaA: string | null;
  lider?: boolean;
};

export type Ocupante = {
  nome: string;
  tipo: "pessoa" | "ia";
  descricao: string;
};

export type Arquetipo = { nome: string };

export type Responsabilidade = {
  missao: string;
  responsabilidades: string[];
  assuntos: string[];
  resultados: string[];
};

export type Nivel = "definido" | "processo" | "operacional";

export type Situacao = "disponivel" | "trabalhando" | "aguardando-vinicius" | "com-problema" | "vaga";

export type Entrega = { data: string; descricao: string };

export type EstadoPosicao = {
  /** `null` quando a posição é ocupada por pessoa ou está vaga. */
  nivel: Nivel | null;
  situacao: Situacao;
  /** Por que está nesse nível: arquivo, skill ou serviço que comprova. */
  evidencia?: string;
  /** Obrigatório quando a situação é "aguardando-vinicius" ou "com-problema". */
  motivo?: string;
  entregas: Entrega[];
  /** Erros recorrentes ou atrasos. Cada alerta aparece na sala. */
  alertas: string[];
};
