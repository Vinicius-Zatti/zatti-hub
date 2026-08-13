/** Regras de geração de ID textual + validação do Painel de Acessos.
 * Puro (sem Next.js nem Supabase) de propósito - testável isolado, sem
 * precisar de banco nem de sessão. */

import type { Role } from "@/lib/acesso";

/** kebab-case sem acento, só [a-z0-9-], sem hífen duplicado nem nas pontas.
 * Nunca vazio - nome sem nenhum caractere aproveitável vira "cliente". */
export function slugify(texto: string): string {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalizado || "cliente";
}

/** ID de organização = slug direto do nome do cliente. */
export function gerarIdOrganizacao(nomeCliente: string): string {
  return slugify(nomeCliente);
}

/** ID de unidade = prefixado pela organização, pra nunca colidir entre
 * clientes diferentes mesmo com nome de unidade igual (ex: duas redes com
 * uma loja "Centro" cada). */
export function gerarIdUnidade(organizacaoId: string, nomeUnidade: string): string {
  return `${organizacaoId}-${slugify(nomeUnidade)}`;
}

export type ResultadoId =
  | { ok: true; id: string }
  | { ok: false; erro: string };

/** Gera o ID e confere colisão contra o conjunto de IDs já existentes
 * (passado de fora - esta função não bate no banco). Nunca sobrescreve:
 * colisão sempre bloqueia com mensagem clara, nunca gera um sufixo
 * alternativo sozinha (isso esconderia o cliente errado atrás de um ID
 * "quase certo" sem ninguém perceber). */
export function gerarIdComColisao(params: {
  candidato: string;
  idsExistentes: ReadonlySet<string>;
  rotulo: string;
}): ResultadoId {
  const { candidato, idsExistentes, rotulo } = params;
  if (idsExistentes.has(candidato)) {
    return {
      ok: false,
      erro: `Já existe ${rotulo} com o ID "${candidato}". Escolha um nome diferente - o painel nunca sobrescreve um cadastro existente.`,
    };
  }
  return { ok: true, id: candidato };
}

/** Papéis que o Painel de Acessos pode atribuir num vínculo novo. Master
 * nunca aparece aqui de propósito - não existe fluxo no painel que crie
 * outro master, em nenhuma circunstância. */
export type PapelAtribuivel = Extract<Role, "gestao" | "operacional">;

export type ResultadoVinculo =
  | { ok: true; role: PapelAtribuivel; unidadeId: string | null }
  | { ok: false; erro: string };

/** Valida o papel + unidade de um vínculo novo antes de qualquer escrita:
 * - nunca aceita "master" (nem que alguém force isso na requisição direto,
 *   sem passar pela tela - a Server Action chama isso sempre, formulário
 *   nunca é a única barreira).
 * - "operacional" exige uma unidade específica (nunca a organização
 *   inteira).
 * - "gestao" aceita unidade nula (acesso a todas as unidades ativas da
 *   organização) ou uma unidade específica. */
export function validarPapelVinculo(params: {
  role: string;
  unidadeId: string | null;
}): ResultadoVinculo {
  const { role, unidadeId } = params;

  if (role !== "gestao" && role !== "operacional") {
    return {
      ok: false,
      erro:
        role === "master"
          ? "O Painel de Acessos não cria vínculos com papel master."
          : `Papel inválido: "${role}".`,
    };
  }

  if (role === "operacional" && !unidadeId) {
    return {
      ok: false,
      erro: "Papel operacional exige uma unidade específica - não pode ser vinculado à organização inteira.",
    };
  }

  return { ok: true, role, unidadeId: role === "gestao" ? unidadeId : unidadeId };
}
