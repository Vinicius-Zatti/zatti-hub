import { describe, expect, it } from "vitest";
import { COR_ESTRELA, contraste, corDaNotaNps, corTextoSobre, normalizarCor, normalizarLinkGoogle, qualidadeLogoImpressao, validarLogo, validarMarca } from "./marca";

describe("cores e contraste", () => {
  it("normaliza a cor para #RRGGBB maiúsculo", () => {
    expect(normalizarCor("#1f4e79")).toBe("#1F4E79");
    expect(normalizarCor("abc")).toBe("#AABBCC");
    expect(normalizarCor("azul")).toBeNull();
  });

  it("contraste WCAG: preto no branco é 21, cor igual é 1", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contraste("#1F4E79", "#1F4E79")).toBeCloseTo(1, 5);
    expect(contraste("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });

  it("texto sai em preto no fundo claro e branco no escuro", () => {
    expect(corTextoSobre("#FFFFFF")).toBe("#111111");
    expect(corTextoSobre("#1F4E79")).toBe("#FFFFFF");
    expect(corTextoSobre("#FFD000")).toBe("#111111");
  });

  it("marca com cores parecidas não salva; link do Google só https", () => {
    const base = { nomeExibido: "Dom Quixote", corPrincipal: "#1F4E79", corFundo: "#FFFFFF", textoAgradecimento: "Obrigado!", linkGoogle: "", ativa: true };
    expect(validarMarca(base)).toMatchObject({ ok: true, marca: { linkGoogle: null } });
    expect(validarMarca({ ...base, corPrincipal: "#F0F0F0" })).toMatchObject({ ok: false });
    expect(validarMarca({ ...base, linkGoogle: "http://g.page/x" })).toMatchObject({ ok: false });
    expect(validarMarca({ ...base, nomeExibido: " " })).toMatchObject({ ok: false });
    expect(normalizarLinkGoogle("https://g.page/r/abc/review")).toEqual({ ok: true, valor: "https://g.page/r/abc/review" });
  });
});

describe("logo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);
  const texto = (s: string) => new TextEncoder().encode(s);

  it("tipo vem do conteúdo (assinatura), só PNG e JPEG", () => {
    expect(validarLogo(png)).toEqual({ ok: true, tipo: "image/png" });
    expect(validarLogo(jpeg)).toEqual({ ok: true, tipo: "image/jpeg" });
    expect(validarLogo(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
  });

  it("SVG nunca entra, nem o simples (a logo é pública no Storage)", () => {
    expect(validarLogo(texto('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toMatchObject({ ok: false });
    expect(validarLogo(texto('<svg><h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script></svg>'))).toMatchObject({ ok: false });
  });

  it("acima de 300 KB não entra", () => {
    const grande = new Uint8Array(300 * 1024 + 1);
    grande.set(png);
    expect(validarLogo(grande)).toMatchObject({ ok: false });
  });
});

describe("qualidade da logo para impressão", () => {
  it("logo pequena (180 x 180, como a da Dom Quixote) pede troca; logo grande não", () => {
    expect(qualidadeLogoImpressao(180, 180).baixa).toBe(true);
    expect(qualidadeLogoImpressao(800, 800).baixa).toBe(false);
    expect(qualidadeLogoImpressao(1200, 300).baixa).toBe(false);
    expect(qualidadeLogoImpressao(0, 0).baixa).toBe(false);
  });
});

describe("corDaNotaNps", () => {
  it("separa as faixas do NPS: 0-6 vermelho, 7-8 âmbar, 9-10 verde", () => {
    expect(corDaNotaNps(0).fundo).toBe(corDaNotaNps(6).fundo);
    expect(corDaNotaNps(7).fundo).toBe(COR_ESTRELA);
    expect(corDaNotaNps(8).fundo).toBe(COR_ESTRELA);
    expect(corDaNotaNps(9).fundo).toBe(corDaNotaNps(10).fundo);
    expect(corDaNotaNps(6).fundo).not.toBe(corDaNotaNps(9).fundo);
  });
});
