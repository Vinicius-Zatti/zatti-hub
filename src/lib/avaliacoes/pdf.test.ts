import { describe, expect, it } from "vitest";
import { pdfComImagemJpeg } from "./pdf";

const texto = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

describe("PDF da arte (10 x 15 cm)", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = pdfComImagemJpeg({ jpeg, larguraPx: 1181, alturaPx: 1772, larguraCm: 10, alturaCm: 15 });
  const s = texto(pdf);

  it("página do tamanho da arte, em pontos", () => {
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("/MediaBox [0 0 283.46 425.20]");
    expect(s).toContain("/Width 1181 /Height 1772");
    expect(s).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("tabela xref aponta para o início de cada objeto", () => {
    const inicioXref = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    expect(s.slice(inicioXref, inicioXref + 4)).toBe("xref");
    const offsets = [...s.slice(inicioXref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("leva o JPEG inteiro, byte a byte", () => {
    const pos = s.indexOf("stream\n") + "stream\n".length;
    expect(Array.from(pdf.slice(pos, pos + jpeg.length))).toEqual(Array.from(jpeg));
  });
});
