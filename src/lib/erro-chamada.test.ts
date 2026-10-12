import { describe, expect, it } from "vitest";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import {
  MENSAGEM_APP_ATUALIZADO,
  MENSAGEM_APP_ATUALIZADO_GUARDADO,
  mensagemFalhaChamada,
} from "@/lib/erro-chamada";

describe("mensagemFalhaChamada", () => {
  it("action de uma versão anterior do app: pede para recarregar", () => {
    const erro = new UnrecognizedActionError('Server Action "abc" was not found on the server.');
    expect(mensagemFalhaChamada(erro, "genérica")).toBe(MENSAGEM_APP_ATUALIZADO);
    expect(mensagemFalhaChamada(erro, "genérica", { guardado: true })).toBe(MENSAGEM_APP_ATUALIZADO_GUARDADO);
    expect(MENSAGEM_APP_ATUALIZADO_GUARDADO).toContain("F5");
  });

  it("outra falha (rede etc.): mantém a mensagem da tela", () => {
    expect(mensagemFalhaChamada(new TypeError("Failed to fetch"), "genérica", { guardado: true })).toBe("genérica");
    expect(mensagemFalhaChamada(undefined, "genérica")).toBe("genérica");
  });
});
