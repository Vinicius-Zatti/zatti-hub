/**
 * Área de trabalho do Vinícius (15/10/2026): organização própria "Zatti HUB"
 * (`organizacoes.area_interna = true`), separada das organizações de cliente.
 * Com ela escolhida, o menu mostra só Início, Agenda, Operação, Meu Tempo, Comercial,
 * Clientes, Conteúdo, Time de IA e Acessos; nas organizações de cliente, o
 * master vê só os módulos do restaurante.
 *
 * O caminho só decide menu e organização exibida. A barreira continua sendo
 * `requireMaster()`/`requireEscritorio()` no servidor e as policies do banco.
 */

/** Cabeçalho que o middleware grava com o caminho da página (sobrescreve o
 * que vier do navegador). Server Components não recebem o pathname. */
export const CABECALHO_CAMINHO = "x-zh-caminho";

/** Telas da área interna. As rotas antigas (/agenda, /meu-tempo, /escritorio)
 * ficam onde estavam porque o Calendar e os scripts do Vini apontam pra elas. */
export const PREFIXOS_AREA_INTERNA = ["/inicio", "/escritorio", "/agenda", "/meu-tempo", "/acessos"] as const;

/** Telas de restaurante: com a Zatti HUB escolhida, voltam para o Início. */
export const PREFIXOS_RESTAURANTE = [
  "/painel",
  "/estoque",
  "/financeiro",
  "/fichas-tecnicas",
  "/equipe",
  "/garante",
  // Páginas de entrada do piloto da Navegação V2 (24/10/2026).
  "/relatorios",
  "/cadastros",
  "/configuracoes",
] as const;

function casaPrefixo(caminho: string, prefixos: readonly string[]): boolean {
  return prefixos.some((p) => caminho === p || caminho.startsWith(`${p}/`) || caminho.startsWith(`${p}-`));
}

export function ehCaminhoAreaInterna(caminho: string): boolean {
  return casaPrefixo(caminho, PREFIXOS_AREA_INTERNA);
}

export function ehCaminhoRestaurante(caminho: string): boolean {
  return casaPrefixo(caminho, PREFIXOS_RESTAURANTE);
}

type OrgEscolha = { id: string; areaInterna: boolean };

/**
 * Organização que o master vê. Ordem:
 * 1. Tela da área interna (link do Calendar, por exemplo) abre a Zatti HUB,
 *    sem mudar a preferência salva.
 * 2. Preferência salva no cookie, se ainda for uma organização ativa.
 * 3. Sem preferência: a primeira organização de cliente pronta, como antes
 *    (a Zatti HUB não vira padrão para não mudar a entrada de ninguém).
 */
export function escolherOrganizacaoMaster(params: {
  organizacoes: OrgEscolha[];
  caminho: string;
  preferida: string | undefined;
  prontas: ReadonlySet<string>;
}): string {
  const { organizacoes, caminho, preferida, prontas } = params;
  const interna = organizacoes.find((o) => o.areaInterna);
  if (interna && ehCaminhoAreaInterna(caminho)) return interna.id;
  if (preferida && organizacoes.some((o) => o.id === preferida)) return preferida;
  const clientes = organizacoes.filter((o) => !o.areaInterna);
  return (clientes.find((o) => prontas.has(o.id)) ?? clientes[0] ?? organizacoes[0]).id;
}
