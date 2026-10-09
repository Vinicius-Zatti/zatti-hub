import { describe, expect, it } from "vitest";
import {
  caminhoFotoFicha,
  caminhoPertenceAFicha,
  detectarTipoFoto,
  dimensoesReduzidas,
  tentativasReducao,
} from "./foto-ficha";

describe("dimensoesReduzidas", () => {
  it("reduz o lado maior para 1600 mantendo a proporção", () => {
    expect(dimensoesReduzidas(4032, 3024)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensoesReduzidas(3024, 4032)).toEqual({ largura: 1200, altura: 1600 });
  });

  it("nunca amplia foto que já é pequena", () => {
    expect(dimensoesReduzidas(800, 600)).toEqual({ largura: 800, altura: 600 });
  });
});

describe("detectarTipoFoto", () => {
  it("reconhece JPEG e WebP pelos primeiros bytes", () => {
    expect(detectarTipoFoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
    expect(detectarTipoFoto(webp)).toBe("image/webp");
  });

  it("recusa PNG, PDF e arquivo vazio", () => {
    expect(detectarTipoFoto(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(detectarTipoFoto(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectarTipoFoto(new Uint8Array())).toBeNull();
  });
});

describe("caminho da foto no bucket", () => {
  it("começa pela unidade e pela ficha", () => {
    expect(caminhoFotoFicha("u1", "f1", "abc", "image/webp")).toBe("u1/f1/abc.webp");
    expect(caminhoFotoFicha("u1", "f1", "abc", "image/jpeg")).toBe("u1/f1/abc.jpg");
  });

  it("só considera da ficha o caminho na pasta dela, com nome gerado pelo app", () => {
    const nome = "0b9c2f7e-4d1a-4c3b-9e8f-1a2b3c4d5e6f";
    expect(caminhoPertenceAFicha(`u1/f1/${nome}.webp`, "u1", "f1")).toBe(true);
    expect(caminhoPertenceAFicha(`u1/f1/${nome}.jpg`, "u1", "f1")).toBe(true);
    expect(caminhoPertenceAFicha(`u1/f1/${nome}.png`, "u1", "f1")).toBe(false);
    expect(caminhoPertenceAFicha("u1/f1/abc.webp", "u1", "f1")).toBe(false);
    expect(caminhoPertenceAFicha(`u2/f1/${nome}.webp`, "u1", "f1")).toBe(false);
    expect(caminhoPertenceAFicha(`u1/f2/${nome}.webp`, "u1", "f1")).toBe(false);
    expect(caminhoPertenceAFicha("u1/f1/../x.webp", "u1", "f1")).toBe(false);
    expect(caminhoPertenceAFicha("u1/f1/", "u1", "f1")).toBe(false);
  });
});

describe("tentativasReducao", () => {
  it("começa em 1600 px com qualidade alta e termina no piso de 480 px", () => {
    const tentativas = tentativasReducao(4032, 3024);
    expect(tentativas[0]).toEqual({ largura: 1600, altura: 1200, qualidade: 0.82 });
    const ultima = tentativas[tentativas.length - 1];
    expect(Math.max(ultima.largura, ultima.altura)).toBe(480);
    expect(ultima.qualidade).toBe(0.52);
  });

  it("foto pequena não é ampliada nem passa por lados maiores que ela", () => {
    const tentativas = tentativasReducao(300, 200);
    expect(tentativas.every((t) => t.largura === 300 && t.altura === 200)).toBe(true);
    expect(tentativas).toHaveLength(4);
  });
});
