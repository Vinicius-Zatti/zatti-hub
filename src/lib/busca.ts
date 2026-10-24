/** Texto comparável nas buscas do app: sem acento, minúsculo e sem espaço
 * nas pontas - "acucar" acha "Açúcar" (Vinícius, 24/10/2026). Aplicar dos
 * dois lados: no termo digitado e no texto procurado. */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
