/** Converte texto formatado em pt-BR (ex: "R$ 4.073,40", "300,000", "45,89")
 * pro número real. No pt-BR o ponto é SEMPRE separador de milhar e a vírgula
 * é SEMPRE o separador decimal — por isso remove todos os pontos antes de
 * trocar a vírgula por ponto decimal. Inverter essa ordem (ou só trocar a
 * primeira vírgula sem tirar os pontos) faz qualquer valor >= 1000 (ex:
 * "R$ 4.073,40") virar "4.073.40", que o Number() não entende, e o campo
 * some silenciosamente como null. Único parser de número usado em todo o
 * `src/lib/sheets/*` — não duplicar essa função em outro arquivo. */
export function toNumeroBR(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const limpo = String(v)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isNaN(n) ? null : n;
}

/** Arredonda valor monetário pra exatamente 2 casas, sempre pra cima -
 * nunca deixa sobrar dízima de multiplicar/dividir preço por quantidade de
 * embalagem (base↔fornecedor, nos dois sentidos).
 *
 * Épsilon subtraído antes do `ceil` de propósito: quando o resultado
 * matemático "certo" já é um número redondo de centavos (ex: 75 × 1), o
 * erro de ponto flutuante de multiplicar/dividir pode empurrar o valor uma
 * fração acima do inteiro (ex: 7500.000000000001) - sem o épsilon, o
 * `Math.ceil` lê isso como "passou de 7500" e soma 1 centavo à toa (75,00
 * virava 75,01 num item com fornecedor na mesma unidade, achado em
 * produção). 1e-9 é pequeno o bastante pra nunca mudar um arredondamento
 * genuíno pra cima (nenhum preço digitado à mão chega perto dessa casa). */
export function arredondarPrecoCima(v: number): number {
  return Math.ceil(v * 100 - 1e-9) / 100;
}
