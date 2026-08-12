import { describe, expect, it, vi, beforeEach } from "vitest";

const acessoFake = {
  userId: "user-master",
  usuarioEmail: "master@zatti.com",
  organizacaoId: "ancora",
  organizacaoNome: "",
  unidadeId: "ancora",
  unidadeNome: "",
  spreadsheetId: null,
  fonteDadosEstoque: "banco" as const,
  consolidadoVendasHabilitado: false,
  role: "master" as const,
  organizacoesDisponiveis: [],
};

const requireMasterMock = vi.fn(async () => acessoFake);
const registrarAuditoriaMock = vi.fn(async () => {});
const exigirLimiteMock = vi.fn(async () => {});
const convidarUsuarioNovoMock = vi.fn();
const rpcMock = vi.fn();
type OrgExistente = { nome: string; tipo_cliente: string; ativo: boolean } | null;
const maybeSingleMock = vi.fn<() => Promise<{ data: OrgExistente; error: null }>>(async () => ({
  data: null,
  error: null,
}));

vi.mock("@/lib/acesso", () => ({
  requireMaster: requireMasterMock,
  registrarAuditoria: registrarAuditoriaMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  exigirLimite: exigirLimiteMock,
  chaveUsuario: (id: string) => `user:${id}`,
}));

vi.mock("@/lib/supabase/admin", () => ({
  convidarUsuarioNovo: convidarUsuarioNovoMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
    })),
    rpc: rpcMock,
  })),
}));

const { criarClienteAdmin } = await import("./actions");

function payloadBase(usuarios: { nome: string; email: string; role: string; unidadeId: string | null }[]) {
  return {
    organizacaoNome: "Dona Ninguém",
    organizacaoId: "dona-ninguem",
    tipoCliente: "saas",
    unidadeNome: "Dona Ninguém",
    fonteDadosEstoque: "banco",
    usuarios,
  };
}

describe("criarClienteAdmin - fluxo e matriz de autorização", () => {
  beforeEach(() => {
    // `resetAllMocks` (não só `clearAllMocks`) de propósito - precisa
    // apagar a `mockImplementation` que um teste anterior deixou em
    // `rpcMock`/`convidarUsuarioNovoMock`, senão um teste vaza estado pro
    // próximo (foi exatamente isso que quebrou o teste 10 na primeira
    // versão: sobrava a implementação do teste 9 em `rpcMock`).
    vi.resetAllMocks();
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    // Padrão: e-mail sempre "novo" (sem conta ainda) - os testes que
    // precisam do caminho "já existe" sobrescrevem com sua própria
    // `mockImplementation` completa.
    rpcMock.mockImplementation(async (nome: string) => {
      if (nome === "admin_buscar_usuario_por_email") return { data: null, error: null };
      throw new Error(`rpc inesperada nesse teste: ${nome}`);
    });
  });

  it("6. envio manual de role=master é rejeitado pelo schema, antes de tocar Auth ou banco", async () => {
    const r = await criarClienteAdmin(
      payloadBase([{ nome: "Alguém", email: "alguem@zatti.com", role: "master", unidadeId: null }])
    );
    expect(r.ok).toBe(false);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("7. organização duplicada (dados divergentes) não gera cadastro parcial - nenhum convite é enviado", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { nome: "Outro Nome", tipo_cliente: "saas", ativo: true },
      error: null,
    });
    const r = await criarClienteAdmin(
      payloadBase([{ nome: "Carol", email: "carol@zatti.com", role: "gestao", unidadeId: null }])
    );
    expect(r.ok).toBe(false);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("8. e-mail já existente no Auth recebe só o vínculo novo, sem convite duplicado", async () => {
    rpcMock.mockImplementation(async (nome: string) => {
      if (nome === "admin_buscar_usuario_por_email") return { data: "id-existente-123", error: null };
      if (nome === "admin_criar_cliente")
        return {
          data: {
            organizacao_id: "dona-ninguem",
            organizacao_criada: true,
            unidade_id: "dona-ninguem",
            unidade_criada: true,
            vinculos: [{ user_id: "id-existente-123", role: "gestao", unidade_id: null, criado: true }],
          },
          error: null,
        };
      throw new Error(`rpc inesperada: ${nome}`);
    });

    const r = await criarClienteAdmin(
      payloadBase([{ nome: "Carol", email: "carol@zatti.com", role: "gestao", unidadeId: null }])
    );

    expect(r.ok).toBe(true);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
    if (r.ok) {
      expect(r.usuarios[0].usuarioExistente).toBe(true);
      expect(r.usuarios[0].convite).toBe("nao_necessario");
    }
  });

  it("9. repetir a mesma solicitação não reconvida quem já foi convidado na tentativa anterior", async () => {
    rpcMock.mockImplementation(async (nome: string) => {
      // Na "segunda tentativa" o e-mail já existe (foi convidado na primeira).
      if (nome === "admin_buscar_usuario_por_email") return { data: "id-novo-456", error: null };
      if (nome === "admin_criar_cliente")
        return {
          data: {
            organizacao_id: "dona-ninguem",
            organizacao_criada: false,
            unidade_id: "dona-ninguem",
            unidade_criada: false,
            vinculos: [{ user_id: "id-novo-456", role: "gestao", unidade_id: null, criado: false }],
          },
          error: null,
        };
      throw new Error(`rpc inesperada: ${nome}`);
    });

    const r = await criarClienteAdmin(
      payloadBase([{ nome: "Tais", email: "tais@zatti.com", role: "gestao", unidadeId: null }])
    );

    expect(r.ok).toBe(true);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
    if (r.ok) expect(r.usuarios[0].vinculoCriado).toBe(false);
  });

  it("10. falha ao convidar um e-mail novo não chama a criação de organização/unidade/vínculo - nada fica inconsistente", async () => {
    convidarUsuarioNovoMock.mockResolvedValueOnce({ ok: false, erro: "Falha simulada da Auth API" });

    const r = await criarClienteAdmin(
      payloadBase([{ nome: "Bar", email: "bar@zatti.com", role: "operacional", unidadeId: "dona-ninguem" }])
    );

    expect(r.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalledWith("admin_criar_cliente", expect.anything());
  });

  it("operacional sem unidade é rejeitado pelo schema antes de qualquer chamada externa", async () => {
    const r = await criarClienteAdmin(
      payloadBase([{ nome: "Bar", email: "bar@zatti.com", role: "operacional", unidadeId: null }])
    );
    expect(r.ok).toBe(false);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("lista de usuários com e-mail duplicado é rejeitada pelo schema", async () => {
    const r = await criarClienteAdmin(
      payloadBase([
        { nome: "Um", email: "duplicado@zatti.com", role: "gestao", unidadeId: null },
        { nome: "Dois", email: "duplicado@zatti.com", role: "gestao", unidadeId: null },
      ])
    );
    expect(r.ok).toBe(false);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
  });

  it("mais de 20 usuários é rejeitado pelo schema", async () => {
    const usuarios = Array.from({ length: 21 }, (_, i) => ({
      nome: `Usuário ${i}`,
      email: `user${i}@zatti.com`,
      role: "gestao",
      unidadeId: null,
    }));
    const r = await criarClienteAdmin(payloadBase(usuarios));
    expect(r.ok).toBe(false);
    expect(convidarUsuarioNovoMock).not.toHaveBeenCalled();
  });
});
