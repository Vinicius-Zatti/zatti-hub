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

/** Unidade conta por setor? (chave por unidade, 28/10/2026)
 *
 * Vale só com as três condições juntas: a chave global acima, o estoque no
 * banco (planilha não tem setor) e a chave "Contagem por setor" da unidade
 * (`unidades.contagem_por_setor_habilitada`, ligada em Configurações >
 * Módulos pelo dono, pela gestão ou pelo master). Antes bastava cadastrar um
 * setor para a unidade mudar de modo sem ninguém decidir. Com a chave
 * desligada, tudo segue como numa unidade sem setor, mesmo com setores
 * cadastrados, que ficam guardados. Toda tela e action que decide o modo da
 * contagem passa por aqui; o banco tem a mesma regra
 * (`exigir_contagem_por_setor_ligada`). */
export function contagemPorSetorVale(acesso: {
  fonteDadosEstoque: string;
  contagemPorSetorHabilitada: boolean;
}): boolean {
  return CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco" && acesso.contagemPorSetorHabilitada;
}

/** Ler o andamento por setor das datas JÁ contadas (Visualização). Não
 * depende da chave da unidade: data contada por setor antes de a chave ser
 * desligada continua corrigível, e a correção exige a versão do setor. Como a
 * chave não troca com contagem em andamento, com ela desligada só sobram
 * datas completas, que se comportam como contagem sem setor. */
export function historicoPorSetorLegivel(acesso: { fonteDadosEstoque: string }): boolean {
  return CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
}

/** Mesma frase do banco (`exigir_contagem_por_setor_ligada`). */
export const MENSAGEM_CONTAGEM_SETOR_DESLIGADA =
  "A contagem por setor está desligada nesta unidade. Para ligar, vá em Configurações > Módulos.";
