import type { FormatoArquivo } from "./tipos";

// Validação do arquivo pelo conteúdo real, nunca pelo nome ou MIME enviado.
// Tudo que falha aqui vira quarentena e não passa por parser nenhum.

export const TAMANHO_MAXIMO_BYTES = 4 * 1024 * 1024; // margem para o limite de 4,5 MB da Vercel
export const PAGINAS_MAXIMAS_PDF = 30;
export const LINHAS_MAXIMAS = 5000;

export type DeteccaoArquivo =
  | { ok: true; formato: Exclude<FormatoArquivo, "desconhecido">; mime: string; texto: string | null }
  | { ok: false; motivo: string; mime: string | null };

function comeca(bytes: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
  if (bytes.length < deslocamento + assinatura.length) return false;
  return assinatura.every((b, i) => bytes[deslocamento + i] === b);
}

/** Decodifica texto: UTF-8 estrito (com ou sem BOM); se inválido, Windows-1252,
 * que é o que OFX e CSV de banco brasileiro costumam usar. */
export function decodificarTexto(bytes: Uint8Array): string {
  const semBom = comeca(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(semBom);
  } catch {
    return new TextDecoder("windows-1252").decode(semBom);
  }
}

const CONTEUDO_ATIVO = /<\s*(script|html|svg|iframe|object|embed)\b|javascript:/i;

export function detectarArquivo(bytes: Uint8Array): DeteccaoArquivo {
  if (bytes.length === 0) return { ok: false, motivo: "arquivo_vazio", mime: null };
  if (bytes.length > TAMANHO_MAXIMO_BYTES) return { ok: false, motivo: "tamanho_excedido", mime: null };

  if (comeca(bytes, [0x4d, 0x5a]) || comeca(bytes, [0x7f, 0x45, 0x4c, 0x46]) || comeca(bytes, [0x23, 0x21])) {
    return { ok: false, motivo: "executavel", mime: null };
  }
  if (comeca(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: true, formato: "pdf", mime: "application/pdf", texto: null };
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, formato: "imagem", mime: "image/png", texto: null };
  }
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return { ok: true, formato: "imagem", mime: "image/jpeg", texto: null };
  if (comeca(bytes, [0x52, 0x49, 0x46, 0x46]) && comeca(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ok: true, formato: "imagem", mime: "image/webp", texto: null };
  }
  if (comeca(bytes, [0x50, 0x4b, 0x03, 0x04])) return { ok: false, motivo: "compactado_nao_suportado", mime: null };
  if (comeca(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: false, motivo: "formato_nao_suportado", mime: null };

  // Texto: sem byte nulo nas primeiras partes (binário disfarçado).
  const amostra = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (amostra.includes(0)) return { ok: false, motivo: "binario_desconhecido", mime: null };
  const texto = decodificarTexto(bytes);
  if (CONTEUDO_ATIVO.test(texto)) return { ok: false, motivo: "conteudo_ativo", mime: null };
  const inicio = texto.slice(0, 2048);
  if (/OFXHEADER\s*:|<OFX>/i.test(inicio)) return { ok: true, formato: "ofx", mime: "application/x-ofx", texto };
  const primeiraLinha = inicio.split(/\r?\n/)[0] ?? "";
  if (/[;,\t]/.test(primeiraLinha)) return { ok: true, formato: "csv", mime: "text/csv", texto };
  return { ok: false, motivo: "formato_desconhecido", mime: null };
}

/** Nome original só para exibição: sem caminho, sem controle, até 120. */
export function sanitizarNomeArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "";
  const limpo = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return limpo || "arquivo";
}
