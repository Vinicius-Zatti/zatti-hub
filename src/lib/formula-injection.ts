/** Neutraliza formula injection (CSV injection) em valores que vão pra CSV
 * ou pro Google Sheets com `valueInputOption: "USER_ENTERED"` - nos dois
 * casos, uma string que começa com `=`, `+`, `-`, `@`, tab ou CR é
 * interpretada como fórmula por Excel/Sheets ao abrir o arquivo (ex: um
 * `nome` de produto cadastrado como `=IMPORTXML(...)` ou `=cmd|...`
 * executaria ao abrir a planilha). Prefixo de aspas simples é o jeito
 * padrão (OWASP) de neutralizar: Excel e Sheets tratam um `'` inicial como
 * "isso é texto", sem mostrar o caractere pra quem olha a célula depois. */
const CARACTERES_PERIGOSOS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function neutralizarFormula(valor: string): string {
  if (valor.length === 0) return valor;
  return CARACTERES_PERIGOSOS.has(valor[0]) ? `'${valor}` : valor;
}
