import { describe, expect, it, vi, beforeEach } from "vitest";

// Builder de um "query builder" fake que aceita qualquer sequência de
// .select()/.eq()/.order()/.in()/.limit() (cada um devolve `this`) e
// resolve pro { data, error } configurado pra aquela tabela quando é
// aguardado (thenable), do jeito que o código real de acesso.ts usa.
function tabelaFake(resultado: { data: unknown; error?: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    in: () => builder,
    limit: () => builder,
    then: (resolve: (v: typeof resultado) => void) => resolve(resultado),
  };
  return builder;
}

type CenarioSupabase = {
  userId: string | null;
  aal?: "aal1" | "aal2";
  vinculos: { organizacao_id: string; unidade_id: string | null; role: string; organizacoes: { nome: string } | null }[];
  organizacoes?: { id: string; nome: string }[];
  unidades?: { id: string; nome: string; spreadsheet_id: string | null; fonte_dados_estoque: string; consolidado_vendas_habilitado: boolean }[];
};

function criarClienteFake(cenario: CenarioSupabase) {
  return {
    auth: {
      getClaims: vi.fn(async () =>
        cenario.userId
          ? { data: { claims: { sub: cenario.userId, email: "teste@zatti.com", aal: cenario.aal ?? "aal1" } }, error: null }
          : { data: null, error: { message: "sem sessão" } }
      ),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: cenario.aal ?? "aal1" },
        })),
      },
    },
    from: vi.fn((tabela: string) => {
      if (tabela === "vinculos") return tabelaFake({ data: cenario.vinculos });
      if (tabela === "organizacoes") return tabelaFake({ data: cenario.organizacoes ?? [] });
      if (tabela === "unidades") return tabelaFake({ data: cenario.unidades ?? [] });
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    }),
  };
}

let cenarioAtual: CenarioSupabase;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => criarClienteFake(cenarioAtual)),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((rota: string) => {
    throw new Error(`REDIRECT:${rota}`);
  }),
}));

const { requireMaster } = await import("./acesso");

describe("requireMaster - matriz de autorização do onboarding administrativo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. master global com AAL2 passa (não redireciona)", async () => {
    cenarioAtual = {
      userId: "user-master",
      aal: "aal2",
      vinculos: [{ organizacao_id: "ancora", unidade_id: null, role: "master", organizacoes: null }],
      organizacoes: [{ id: "dona-ninguem", nome: "Dona Ninguém" }],
      unidades: [
        {
          id: "dona-ninguem",
          nome: "Dona Ninguém",
          spreadsheet_id: null,
          fonte_dados_estoque: "banco",
          consolidado_vendas_habilitado: false,
        },
      ],
    };
    const acesso = await requireMaster();
    expect(acesso.role).toBe("master");
  });

  it("2. master sem AAL2 é bloqueado (manda pra /mfa, não pra tela de admin)", async () => {
    cenarioAtual = {
      userId: "user-master",
      aal: "aal1",
      vinculos: [{ organizacao_id: "ancora", unidade_id: null, role: "master", organizacoes: null }],
    };
    await expect(requireMaster()).rejects.toThrow("REDIRECT:/mfa");
  });

  it("3. gestão é bloqueada", async () => {
    cenarioAtual = {
      userId: "user-gestao",
      vinculos: [
        { organizacao_id: "dona-ninguem", unidade_id: null, role: "gestao", organizacoes: { nome: "Dona Ninguém" } },
      ],
    };
    await expect(requireMaster()).rejects.toThrow(/^REDIRECT:/);
  });

  it("4. operacional é bloqueado", async () => {
    cenarioAtual = {
      userId: "user-operacional",
      vinculos: [
        {
          organizacao_id: "dona-ninguem",
          unidade_id: "dona-ninguem",
          role: "operacional",
          organizacoes: { nome: "Dona Ninguém" },
        },
      ],
    };
    await expect(requireMaster()).rejects.toThrow(/^REDIRECT:/);
  });

  it("5. usuário anônimo (sem sessão) é bloqueado", async () => {
    cenarioAtual = { userId: null, vinculos: [] };
    await expect(requireMaster()).rejects.toThrow("REDIRECT:/login");
  });
});
