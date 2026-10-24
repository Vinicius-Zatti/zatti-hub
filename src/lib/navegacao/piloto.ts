// Navegação V2 (24/10/2026), fase 0: chave do piloto. Só a unidade da lista
// (id da tabela `unidades`) vê o menu novo em sanfona; todas as outras e a
// área interna (Zatti HUB do Vinícius) seguem com o menu atual até Vinícius
// aprovar. Lista provisória: some na fase 8 (liberar para todas as unidades).
export const UNIDADES_PILOTO_NAVEGACAO: readonly string[] = ["zatti-burger"];

export function usaNavegacaoV2(acesso: { unidadeId: string; areaInterna: boolean }): boolean {
  if (acesso.areaInterna) return false;
  return UNIDADES_PILOTO_NAVEGACAO.includes(acesso.unidadeId);
}
