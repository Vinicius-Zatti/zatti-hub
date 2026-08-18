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

/** Arredonda valor monetário pra exatamente 2 casas pelo centavo mais
 * próximo (regra fechada com o Vinícius, 18/08): milésimo 0 não muda nada;
 * 1 a 4 arredonda pra baixo; 5 a 9 arredonda pra cima. Não é "sempre pra
 * cima" - multiplicar/dividir preço por quantidade de embalagem
 * (base↔fornecedor) pode fechar num valor redondo (ex: 75 × 1 = 75,00) e
 * esse caso tem que continuar exatamente redondo, nunca subir sozinho pro
 * centavo seguinte.
 *
 * Épsilon somado antes do `round` de propósito: multiplicar/dividir ponto
 * flutuante raramente cai num número exato - 75 × 1 pode virar
 * 74.99999999999999 por dentro, e sem a margem o `Math.round` erra o
 * centavo de verdade só por causa da imprecisão binária (75,00 virando
 * 74,99 num item sem conversão nenhuma, achado em produção). 1e-9 é pequeno
 * o bastante pra nunca mudar o resultado de um arredondamento genuíno
 * (nenhum preço digitado à mão chega perto dessa casa decimal). */
export function arredondarPreco(v: number): number {
  return Math.round(v * 100 + 1e-9) / 100;
}
