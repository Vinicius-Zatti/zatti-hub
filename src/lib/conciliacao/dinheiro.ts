import { toNumeroBR } from "@/lib/sheets/numero";

// Dinheiro da Conciliação trafega em centavos inteiros até o banco. Texto
// em formato brasileiro passa pelo `toNumeroBR` (regra do AGENTS.md), mas
// só depois de validado por uma expressão estrita: o `toNumeroBR` sozinho
// aceitaria "abc12" como 12. Valores OFX (ponto decimal) nunca passam por
// ele, porque ele remove pontos.

const LIMITE_CENTAVOS = 99_999_999_999_99; // numeric(14,2)

const BR_ESTRITO = /^([+-])?\s*(?:R\$\s*)?([+-])?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** "R$ 1.234,56", "-R$ 12,00", "1234,5", "-1.000" -> centavos com sinal.
 * `null` quando o texto não é um valor brasileiro inequívoco. */
export function centavosDeTextoBR(texto: string): number | null {
  const limpo = texto.replace(/ /g, " ").trim();
  const m = BR_ESTRITO.exec(limpo);
  if (!m) return null;
  if (m[1] && m[2]) return null; // sinal duplicado
  const negativo = m[1] === "-" || m[2] === "-";
  const numero = toNumeroBR(`${m[3]}${m[4] !== undefined ? `,${m[4]}` : ""}`);
  if (numero === null) return null;
  const centavos = Math.round(numero * 100);
  if (!Number.isSafeInteger(centavos) || Math.abs(centavos) > LIMITE_CENTAVOS) return null;
  return negativo ? -centavos : centavos;
}

const PONTO_ESTRITO = /^([+-])?(\d+)(?:[.,](\d{1,2}))?$/;

/** Valor OFX (TRNAMT): "-1234.56", "150", "12,5". Sem separador de milhar.
 * Converte por string, sem ponto flutuante. */
export function centavosDeTextoOfx(texto: string): number | null {
  const m = PONTO_ESTRITO.exec(texto.trim());
  if (!m) return null;
  const inteiro = m[2].replace(/^0+(?=\d)/, "");
  const fracao = (m[3] ?? "").padEnd(2, "0");
  if (inteiro.length > 12) return null;
  const centavos = Number(inteiro) * 100 + Number(fracao);
  if (!Number.isSafeInteger(centavos) || centavos > LIMITE_CENTAVOS) return null;
  return m[1] === "-" ? -centavos : centavos;
}

export function centavosParaTexto(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos <= 0) throw new Error("valor_invalido");
  return String(centavos);
}
