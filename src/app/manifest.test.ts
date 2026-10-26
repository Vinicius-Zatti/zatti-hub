import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../../middleware";
import manifest from "./manifest";

describe("manifesto do app (instalação no Android)", () => {
  const m = manifest();

  it("abre em tela cheia como app, a partir da raiz", () => {
    expect(m.name).toBe("Zatti Hub");
    expect(m.short_name).toBe("Zatti Hub");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("tem ícones de 192 e 512 px e um maskable, todos existentes em public/", () => {
    const icones = m.icons ?? [];
    expect(icones.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icones.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icone of icones) {
      expect(existsSync(path.join(process.cwd(), "public", icone.src))).toBe(true);
    }
  });

  it("middleware não intercepta manifesto nem ícones (abrem sem login)", () => {
    const filtro = new RegExp(`^${config.matcher[0]}$`);
    expect(filtro.test("/manifest.webmanifest")).toBe(false);
    for (const icone of m.icons ?? []) expect(filtro.test(icone.src)).toBe(false);
    // Páginas do app continuam passando pelo middleware.
    expect(filtro.test("/estoque/produtos")).toBe(true);
    expect(filtro.test("/")).toBe(true);
  });
});
