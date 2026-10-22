import { describe, expect, it } from "vitest";
import { cliqueAbreOutraAba } from "./guarda-clique";

const clique = (extra: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> & { button?: number } = {}) => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  button: 0,
  ...extra,
});
const link = (target: string | null = null) => ({ getAttribute: (nome: string) => (nome === "target" ? target : null) });

describe("cliqueAbreOutraAba", () => {
  it("clique comum no link sai da tela (mostra o aviso)", () => {
    expect(cliqueAbreOutraAba(clique(), link())).toBe(false);
    expect(cliqueAbreOutraAba(clique(), link("_self"))).toBe(false);
  });

  it("Cmd+clique (Mac), Ctrl+clique, Shift e Alt abrem fora: sem aviso", () => {
    expect(cliqueAbreOutraAba(clique({ metaKey: true }), link())).toBe(true);
    expect(cliqueAbreOutraAba(clique({ ctrlKey: true }), link())).toBe(true);
    expect(cliqueAbreOutraAba(clique({ shiftKey: true }), link())).toBe(true);
    expect(cliqueAbreOutraAba(clique({ altKey: true }), link())).toBe(true);
  });

  it("botão do meio e link com target abrem fora: sem aviso", () => {
    expect(cliqueAbreOutraAba(clique({ button: 1 }), link())).toBe(true);
    expect(cliqueAbreOutraAba(clique(), link("_blank"))).toBe(true);
  });
});
