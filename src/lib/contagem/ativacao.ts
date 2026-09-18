/** Chave única que separa "cadastro de setores" de "contagem por setor".
 *
 * Ligada em 2026-09-17 por decisão de Vinícius, pra validar o fluxo na
 * prática. Os riscos da v1 foram assumidos conscientemente: as correções de
 * integridade apontadas pelo Codex ainda não entraram.
 *
 * Com `true`, a Contagem pede o setor e congela a lista no "Iniciar
 * contagem", a Conferência abre por setor e consolidada, a Cotação avisa e
 * exige confirmação em data parcial e o CMV recusa data parcial.
 *
 * Enquanto houver produto sem setor, ele não entra em contagem nenhuma, e por
 * isso Cotação e CMV ainda não devem ser lidos como definitivos.
 *
 * Voltar para `false` desliga tudo isso e devolve o fluxo por grupo de
 * produto, sem nenhum passo de banco. */
export const CONTAGEM_POR_SETOR_ATIVA = true;
