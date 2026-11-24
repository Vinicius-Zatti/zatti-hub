// Chave de acesso de NF-e/NFC-e (44 dígitos) em PDF e foto (24/11/2026). A mesma nota chegou por e-mail em PDF
// depois de entrar pela SEFAZ em XML e não houve aviso: a chave só travava XML com XML e a leitura pegou o CNPJ
// do destinatário. A chave com dígito verificador conferido é prova de que é a mesma nota.

/** Texto com 44 dígitos (com ou sem espaços) e dígito verificador (módulo 11) certo -> chave; senão null. */
export function chaveValida(texto: string | null | undefined): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  if (d.length !== 44) return null;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(d[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(d[43]) ? d : null;
}

/** Primeira chave válida dentro de um texto, como o nome do arquivo ("NFe3526...757.pdf"). */
export function chaveNoTexto(texto: string | null | undefined): string | null {
  for (const m of (texto ?? "").matchAll(/(?<!\d)\d{44}(?!\d)/g)) {
    const c = chaveValida(m[0]);
    if (c) return c;
  }
  return null;
}

function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const n of base) {
      soma += Number(n) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

/** CNPJ do emitente gravado na chave (posições 7 a 20). Emitente pessoa física (CPF) -> null. */
export function cnpjDaChave(chave: string): string | null {
  const c = chave.slice(6, 20);
  return cnpjValido(c) ? c : null;
}
