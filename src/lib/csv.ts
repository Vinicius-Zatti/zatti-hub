/**
 * Campo de CSV com separador ";" para o Excel em português (revisão de segurança 09/11).
 * Texto que começa com =, +, -, @, tab ou retorno vira fórmula ao abrir a planilha; ganha um
 * apóstrofo na frente para ficar texto. Número puro ("-12,50", "3") passa intacto, para a planilha
 * continuar somando valores negativos.
 */
const NUMERO = /^-?\d+(,\d+)?$/;
const INICIO_DE_FORMULA = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r]/;

export function campoCsv(texto: string): string {
  const seguro = !NUMERO.test(texto) && INICIO_DE_FORMULA.test(texto) ? `'${texto}` : texto;
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function linhaCsv(campos: string[]): string {
  return campos.map(campoCsv).join(";");
}
