// Navegação V2: piloto no Zatti Burger de 24 a 25/10/2026; liberada para todas as unidades em
// 26/10/2026 com o ok de Vinícius (fase 8). Só a área interna (Zatti HUB do Vinícius) segue com o
// menu antigo. O nome da função fica para não mexer nos 40 lugares que a chamam.
export function usaNavegacaoV2(acesso: { unidadeId: string; areaInterna: boolean }): boolean {
  return !acesso.areaInterna;
}
