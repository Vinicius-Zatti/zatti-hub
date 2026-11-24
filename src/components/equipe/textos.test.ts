import { describe, expect, it } from "vitest";
import { textoEnvio } from "./textos";

// O aviso cita o botão com o mesmo nome do cartão (24/11/2026): conta nova = "Reenviar senha".
describe("textoEnvio: falhou", () => {
  it("conta nova manda usar Reenviar senha", () => {
    const t = textoEnvio("falhou", false);
    expect(t.tom).toBe("erro");
    expect(t.texto).toContain('"Reenviar senha"');
    expect(t.texto).not.toContain("Reenviar acesso");
  });
  it("conta que já existia manda usar Reenviar acesso", () => {
    expect(textoEnvio("falhou", true).texto).toContain('"Reenviar acesso"');
  });
});
