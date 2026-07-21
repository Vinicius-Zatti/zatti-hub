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
