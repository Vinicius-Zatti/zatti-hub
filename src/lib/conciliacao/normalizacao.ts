// Normalização e máscara de descrições bancárias. Versionada: mudar a regra
// muda a identidade (fingerprint) dos movimentos, então toda mudança sobe
// `VERSAO_NORMALIZACAO` e o banco só compara fingerprints da mesma versão.

export const VERSAO_NORMALIZACAO = 1;

/** Mascara CPF, CNPJ (inteiro ou raiz), contas e qualquer sequência longa de
 * dígitos. Fica só o final, suficiente para a pessoa reconhecer. */
export function mascararDocumentos(texto: string): string {
  return texto
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (m) => `**.***.***/****-${m.slice(-2)}`)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) => `***.***.***-${m.slice(-2)}`)
    .replace(/\b\d{2}\.\d{3}\.\d{3}\b/g, "**.***.***")
    .replace(/\d{9,}/g, (m) => `${"*".repeat(m.length - 2)}${m.slice(-2)}`);
}

/** Mesmo recorte do motor da DQ: sem acento, minúsculas, hífen isolado vira
 * espaço, espaços colapsados. */
export function normalizarDescricao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Prefixos de operação bancária (documentados e observados nos extratos da
// DQ). Mais específico primeiro.
const PREFIXOS_BANCARIOS = [
  "qr code pix enviado",
  "pix enviado",
  "pagamento de conta",
  "deb pix chave",
  "pix recebido dados conta",
  "pix recebido",
  "cred pix chave",
  "deb pix qr cod din",
  "deb pix qr cod est",
  "recebimento ted",
  "pagamento de boleto",
  "pix automatico enviado",
].sort((a, b) => b.length - a.length);

/** Descrição sem o prefixo da operação: o que sobra costuma ser o favorecido
 * ou pagador. Usada como padrão exato das regras. */
export function descricaoParaBusca(descricaoNormalizada: string): string {
  for (const prefixo of PREFIXOS_BANCARIOS) {
    if (descricaoNormalizada.startsWith(prefixo)) {
      return descricaoNormalizada.slice(prefixo.length).replace(/^[\s-]+/, "").trim();
    }
  }
  return descricaoNormalizada;
}

/** Descrição original limpa para gravar: sem controle, espaços colapsados,
 * documentos mascarados, até 300 caracteres. */
export function prepararDescricaoOriginal(texto: string): string {
  const limpo = texto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return mascararDocumentos(limpo).slice(0, 300);
}
