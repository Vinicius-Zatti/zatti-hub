import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { matrizQr, nomeArquivoArte, pixelsQr, slugValido, URL_BASE_PADRAO, urlBase, urlPublica } from "./qr";

function lerDeVolta(texto: string): string | null {
  const { largura, dados } = pixelsQr(matrizQr(texto), 6);
  return jsQR(dados, largura, largura)?.data ?? null;
}

describe("endereço público da pesquisa", () => {
  it("monta o endereço fixo por origem, sempre em produção por padrão", () => {
    expect(urlPublica("dom-quixote", "salao")).toBe("https://zatti-hub.vercel.app/avaliar/dom-quixote/salao");
    expect(urlPublica("dom-quixote", "delivery", "https://exemplo.com.br/")).toBe("https://exemplo.com.br/avaliar/dom-quixote/delivery");
    expect(URL_BASE_PADRAO).toBe("https://zatti-hub.vercel.app");
  });

  it("recusa endereço fora do padrão (nada de barra, espaço ou maiúscula)", () => {
    expect(slugValido("dom-quixote")).toBe(true);
    expect(slugValido("Dom Quixote")).toBe(false);
    expect(slugValido("a")).toBe(false);
    expect(() => urlPublica("../x", "salao")).toThrow();
  });

  it("base configurada só vale se for https sem caminho", () => {
    expect(urlBase({ AVALIACOES_URL_BASE: "https://app.zatti.com.br/" })).toBe("https://app.zatti.com.br");
    expect(urlBase({ AVALIACOES_URL_BASE: "http://inseguro.com" })).toBe(URL_BASE_PADRAO);
    expect(urlBase({ AVALIACOES_URL_BASE: "https://x.com/caminho" })).toBe(URL_BASE_PADRAO);
    expect(urlBase({})).toBe(URL_BASE_PADRAO);
  });
});

describe("QR Code", () => {
  it("lê de volta exatamente a URL da mesa e a do delivery", () => {
    for (const origem of ["salao", "delivery"] as const) {
      const url = urlPublica("dom-quixote", origem);
      expect(lerDeVolta(url)).toBe(url);
    }
  });

  it("endereço longo também volta inteiro", () => {
    const url = urlPublica("restaurante-com-nome-bem-comprido-2", "delivery");
    expect(lerDeVolta(url)).toBe(url);
  });

  it("matriz quadrada com os três quadrados de canto", () => {
    const m = matrizQr(urlPublica("dom-quixote", "salao"));
    expect(m.length).toBe(m[0].length);
    expect(m.length).toBeGreaterThanOrEqual(21);
    // Cantos superiores e inferior esquerdo são escuros (padrão de localização).
    expect(m[0][0] && m[0][m.length - 1] && m[m.length - 1][0]).toBe(true);
  });

  it("nome do arquivo diz mesa ou delivery", () => {
    expect(nomeArquivoArte("dom-quixote", "salao", "pdf")).toBe("qr-avaliacao-dom-quixote-mesa.pdf");
    expect(nomeArquivoArte("dom-quixote", "delivery", "png")).toBe("qr-avaliacao-dom-quixote-delivery.png");
  });
});
