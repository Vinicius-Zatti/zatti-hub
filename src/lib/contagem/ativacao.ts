/** Chave única que separa "cadastro de setores" de "contagem por setor".
 *
 * v1 publica só o cadastro: a cliente cria os setores e designa os produtos.
 * Enquanto isto for `false`, existir setor cadastrado NÃO muda nada em
 * Contagem, Conferência, Cotação nem CMV - o fluxo continua exatamente o de
 * hoje, por grupo de produto.
 *
 * Pra ligar a contagem por setor na etapa 2: troque para `true`, publique e
 * confira que as migrações 20260917090000 e 20260917093000 já estão aplicadas.
 * O código do fluxo completo já está no repositório, só não é alcançado. */
export const CONTAGEM_POR_SETOR_ATIVA = false;
