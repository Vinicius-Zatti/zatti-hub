/** Funções puras do campo numérico digitado (`CampoNumero`). Ficam fora de
 * `src/lib/sheets/*` de propósito: são usadas em componente client e não
 * podem arrastar dependência de servidor pro navegador. */

/** Converte o que a pessoa digitou ou colou em pt-BR pro número real.
 * "R$ 1.500,00" vale 1500 e "3,50" vale 3,5. Ponto é separador de milhar,
 * exceto quando é o único separador e não vem seguido de exatamente 3
 * dígitos: "3.50" (teclado que só tem ponto) vale 3,5, nunca 350. "1.500"
 * continua valendo 1500. Texto que não é número devolve null. */
export function interpretarNumeroDigitado(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (limpo === "") return null;
  const pontoDecimal = !limpo.includes(",") && /^-?\d*\.\d{1,2}$|^-?\d*\.\d{4,}$/.test(limpo);
  const normalizado = pontoDecimal ? limpo : limpo.replace(/\./g, "").replace(",", ".");
  const num = Number(normalizado);
  return Number.isNaN(num) ? null : num;
}

/** Número exibido fora de foco: vírgula decimal, ponto de milhar e casas
 * fixas (minimum = maximum, senão 1300 e 1,1 saem em formatos diferentes na
 * mesma coluna). */
export function formatarNumeroCampo(valor: number | null, decimais: number): string {
  if (valor === null) return "";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}
