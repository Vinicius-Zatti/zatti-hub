/**
 * Google Sheets interpreta valores enviados com USER_ENTERED. Um texto que
 * comeca com =, +, - ou @ pode virar formula. O apostrofo inicial obriga a
 * celula a permanecer texto e nao aparece para o usuario na planilha.
 */
export function paraCelulaSegura(valor: string): string {
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(valor) ? `'${valor}` : valor;
}
