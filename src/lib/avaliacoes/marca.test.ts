import { describe, expect, it } from "vitest";
import { contraste, corTextoSobre, normalizarCor, normalizarLinkGoogle, svgInseguro, validarLogo, validarMarca } from "./marca";

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
  const svg = (s: string) => new TextEncoder().encode(s);

  it("tipo vem do conteúdo, não do que o navegador diz", () => {
    expect(validarLogo(png, "image/jpeg")).toEqual({ ok: true, tipo: "image/png" });
    expect(validarLogo(jpeg, "image/png")).toEqual({ ok: true, tipo: "image/jpeg" });
    expect(validarLogo(svg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'), "image/svg+xml")).toEqual({
      ok: true,
      tipo: "image/svg+xml",
    });
    expect(validarLogo(new Uint8Array([1, 2, 3]), "image/gif")).toMatchObject({ ok: false });
  });

  it("acima de 300 KB não entra", () => {
    const grande = new Uint8Array(300 * 1024 + 1);
    grande.set(png);
    expect(validarLogo(grande, "image/png")).toMatchObject({ ok: false });
  });

  it("SVG com script, evento ou link externo é recusado", () => {
    expect(svgInseguro("<svg><script>alert(1)</script></svg>")).toBe(true);
    expect(svgInseguro('<svg onload="x()"></svg>')).toBe(true);
    expect(svgInseguro('<svg><image href="https://mal.com/x.png"/></svg>')).toBe(true);
    expect(svgInseguro('<svg><a xlink:href="javascript:x"/></svg>')).toBe(true);
    expect(svgInseguro('<svg><use href="#a"/></svg>')).toBe(true);
    expect(svgInseguro('<svg><path fill="url(#g)" d="M0 0"/></svg>')).toBe(false);
    expect(svgInseguro('<svg><image href="data:image/png;base64,AAAA"/></svg>')).toBe(false);
  });
});
