import "server-only";
import { PAGINAS_MAXIMAS_PDF } from "./arquivo";
import type { TrechoPdf } from "./pdf-pagseguro";
import { comLimite, type Prazo } from "./prazo";

// Leitura estrutural do PDF pelo pdfjs (Mozilla), no servidor:
// sem fontes do sistema, sem scripts (o pdfjs só executa JavaScript de PDF
// no visualizador com `enableScripting`, que não é usado aqui). Senha,
// PDF inválido e excesso de páginas viram quarentena, detectados pela
// leitura real e não por busca de texto nos bytes. A versão 6 do pdfjs não
// usa eval (conferido no pacote em 29/09) e XFA fica desligado.

export type TextoPdf =
  | { ok: true; paginas: number; trechos: TrechoPdf[] }
  | { ok: false; motivo: "pdf_protegido" | "pdf_invalido" | "paginas_excedidas" | "pdf_tempo_excedido" };

const TEMPO_MAXIMO_MS = 20_000;

/** Abre e lê todas as páginas dentro de um único limite de tempo (o menor
 * entre 20 s e o que sobra do prazo da leitura). Estourou: a tarefa do pdfjs
 * é destruída e o arquivo vai para quarentena por tempo. */
export async function extrairTextoPdf(bytes: Uint8Array, prazo?: Prazo): Promise<TextoPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarefa = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  const leitura = (async (): Promise<TextoPdf> => {
    const doc = await tarefa.promise;
    if (doc.numPages > PAGINAS_MAXIMAS_PDF) return { ok: false, motivo: "paginas_excedidas" };
    const trechos: TrechoPdf[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      if (prazo?.sinal.aborted) return { ok: false, motivo: "pdf_tempo_excedido" };
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      for (const item of conteudo.items) {
        if ("str" in item) trechos.push({ texto: item.str, fimDeLinha: item.hasEOL });
      }
    }
    return { ok: true, paginas: doc.numPages, trechos };
  })();
  const limite = Math.min(TEMPO_MAXIMO_MS, prazo ? prazo.restante() : TEMPO_MAXIMO_MS);
  try {
    const resultado = await comLimite(leitura, limite, prazo?.sinal);
    return resultado ?? { ok: false, motivo: "pdf_tempo_excedido" };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "PasswordException") return { ok: false, motivo: "pdf_protegido" };
    return { ok: false, motivo: "pdf_invalido" };
  } finally {
    // Cancela o que ainda estiver rodando (inclusive depois de estourar o tempo).
    leitura.catch(() => undefined);
    await tarefa.destroy().catch(() => undefined);
  }
}
