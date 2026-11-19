import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Corpo que o Hub manda ao Vini (18/11/2026): o remetente decide o número. Sem ele, "hub" (chip).

vi.mock("server-only", () => ({}));

const { enviarAcessoPeloVini } = await import("./envio");
const { remetenteDoAcesso, remetenteDoEnvio } = await import("./remetente-servidor");

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

// Critério de cliente direto (remetente-servidor.ts): banco simulado por tabela.
type Resposta = { data: unknown[] | null; error: unknown };
function bancoFalso(tabelas: Record<string, Resposta>) {
  return {
    from: (tabela: string) => {
      const r = tabelas[tabela] ?? { data: [], error: null };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit"]) q[m] = () => q;
      q.then = (ok: (v: Resposta) => unknown) => Promise.resolve(r).then(ok);
      return q;
    },
  } as never;
}

describe("remetenteDoAcesso", () => {
  it("comprador do app (conta do provisionamento) vai pelo número de Vinícius", async () => {
    const admin = bancoFalso({ zh_provisionamentos: { data: [{ id: "p1" }], error: null } });
    expect(await remetenteDoAcesso(admin, "u1")).toBe("vinicius");
  });
  it("titular marcado, mesmo pendente, vai pelo número de Vinícius", async () => {
    const admin = bancoFalso({
      vinculos: { data: [{ id: "v1" }], error: null },
      titulares_organizacao: { data: [{ vinculo_id: "v1" }], error: null },
    });
    expect(await remetenteDoAcesso(admin, "u1")).toBe("vinicius");
  });
  it("equipe do cliente vai pelo chip", async () => {
    const admin = bancoFalso({ vinculos: { data: [{ id: "v1" }], error: null } });
    expect(await remetenteDoAcesso(admin, "u1")).toBe("hub");
  });
  it("master (Vinícius ou o Vini a pedido dele) manda: sempre pelo número dele, até para equipe", async () => {
    const admin = bancoFalso({ vinculos: { data: [{ id: "v1" }], error: null } });
    expect(await remetenteDoEnvio(admin, "master", "u1")).toBe("vinicius");
    expect(await remetenteDoEnvio(admin, "gestao", "u1")).toBe("hub");
  });
  it("consulta que falha nunca manda pelo chip", async () => {
    for (const tabela of ["zh_provisionamentos", "vinculos", "titulares_organizacao"]) {
      const admin = bancoFalso({
        vinculos: { data: [{ id: "v1" }], error: null },
        [tabela]: { data: null, error: { message: "falhou" } },
      });
      expect(await remetenteDoAcesso(admin, "u1")).toBe("vinicius");
    }
  });
});
