import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Corpo que o Hub manda ao Vini (18/11/2026): o remetente decide o número. Sem ele, "hub" (chip).

vi.mock("server-only", () => ({}));

const { enviarAcessoPeloVini } = await import("./envio");

const BASE = {
  tipo: "conta_existente" as const,
  idempotencia: "teste-remetente-0001",
  whatsapp: "+5531999990004",
  nome: "Pessoa",
  email: "pessoa@teste.local",
  organizacaoNome: "Cliente A",
};

let corpos: Record<string, unknown>[] = [];

beforeEach(() => {
  corpos = [];
  vi.stubEnv("VINI_URL", "https://vini.teste");
  vi.stubEnv("ZATTI_HUB_ENVIO_TOKEN", "token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      corpos.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enviarAcessoPeloVini: remetente", () => {
  it("sem remetente vai como hub (equipe pelo chip)", async () => {
    expect(await enviarAcessoPeloVini(BASE)).toBe("aceito");
    expect(corpos[0].remetente).toBe("hub");
  });
  it("titular e comprador vão como vinicius", async () => {
    await enviarAcessoPeloVini({ ...BASE, remetente: "vinicius" });
    expect(corpos[0].remetente).toBe("vinicius");
  });
});
