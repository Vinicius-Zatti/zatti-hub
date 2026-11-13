import qrcode from "qrcode-generator";
import { ROTULO_ORIGEM, type Origem } from "./perguntas";

// Avaliações: endereço público fixo da pesquisa e o QR Code que aponta para ele. O QR sai da
// biblioteca qrcode-generator (Kazuhiko Arase, MIT, sem dependências); aqui só se monta a matriz
// e o desenho. O teste lê o QR de volta (jsQR) e confere a URL.

/** Endereço de produção do Zatti Hub. A arte impressa aponta sempre para cá (nunca para a
 * prévia de um deploy), salvo `AVALIACOES_URL_BASE` no servidor. */
export const URL_BASE_PADRAO = "https://zatti-hub.vercel.app";

export function urlBase(env: Record<string, string | undefined> = process.env): string {
  const valor = (env.AVALIACOES_URL_BASE ?? "").trim();
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(valor.replace(/\/+$/, "")) ? valor.replace(/\/+$/, "") : URL_BASE_PADRAO;
}

export function slugValido(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
}

/** https://zatti-hub.vercel.app/avaliar/dom-quixote/salao */
export function urlPublica(slug: string, origem: Origem, base: string = URL_BASE_PADRAO): string {
  if (!slugValido(slug)) throw new Error("Endereço da pesquisa inválido.");
  return `${base.replace(/\/+$/, "")}/avaliar/${slug}/${origem}`;
}

/** Matriz do QR (true = módulo escuro). Correção "M" (aguenta ~15% de sujeira ou dobra no papel)
 * e versão automática. */
export function matrizQr(texto: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(texto, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, l) => Array.from({ length: n }, (_, c) => qr.isDark(l, c)));
}

/** Pixels RGBA da matriz com a margem de silêncio (4 módulos), para ler de volta no teste e para
 * conferir o desenho. Preto no branco. */
export function pixelsQr(matriz: boolean[][], tamanhoModulo: number): { largura: number; dados: Uint8ClampedArray } {
  const margem = 4;
  const n = matriz.length + margem * 2;
  const largura = n * tamanhoModulo;
  const dados = new Uint8ClampedArray(largura * largura * 4).fill(255);
  for (let l = 0; l < matriz.length; l++) {
    for (let c = 0; c < matriz.length; c++) {
      if (!matriz[l][c]) continue;
      for (let y = 0; y < tamanhoModulo; y++) {
        for (let x = 0; x < tamanhoModulo; x++) {
          const i = (((l + margem) * tamanhoModulo + y) * largura + (c + margem) * tamanhoModulo + x) * 4;
          dados[i] = 0;
          dados[i + 1] = 0;
          dados[i + 2] = 0;
        }
      }
    }
  }
  return { largura, dados };
}

// ── Arte 10 x 15 cm ──────────────────────────────────────────────────────

/** 10 x 15 cm a 300 dpi (impressão nítida). */
export const ARTE = { larguraPx: 1181, alturaPx: 1772, larguraCm: 10, alturaCm: 15 } as const;

export const CHAMADA_ARTE = "Conta pra gente como foi";

export function subtituloArte(origem: Origem): string {
  if (origem === "salao") return "Aponte a câmera do celular para o código. Leva 30 segundos.";
  if (origem === "app") return "Pediu pelo app? Aponte a câmera e conte como chegou. Leva 30 segundos.";
  return "Pediu com a gente? Aponte a câmera e conte como chegou. Leva 30 segundos.";
}

export function nomeArquivoArte(slug: string, origem: Origem, extensao: "png" | "pdf"): string {
  const sufixo = origem === "salao" ? "mesa" : origem === "app" ? "apps" : "delivery";
  return `qr-avaliacao-${slug}-${sufixo}.${extensao}`;
}

export function rotuloArte(origem: Origem): string {
  return origem === "salao" ? "Mesa (salão)" : ROTULO_ORIGEM[origem];
}
