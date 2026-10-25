import { beforeEach, describe, expect, it, vi } from "vitest";

// Editar acesso sem revogar (24/10/2026): regras puras e as duas Server Actions
// (Equipe e Acessos) com banco simulado. A regra de quem pode é provada no banco
// (supabase/tests/database/editar_vinculo_acesso.sql); aqui, o que o servidor manda
// ao banco e o que faz com a resposta.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));

const acessoGestao = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "gestao",
  organizacaoId: "org-a",
  organizacaoNome: "Cliente A",
  unidadeId: "org-a-loja",
  unidadeFixa: null as string | null,
  equipeHabilitado: true,
};
const acessoMaster = { ...acessoGestao, userId: "99999999-9999-4999-8999-999999999999", role: "master" };

let acessoEquipeAtual = acessoGestao;
const requireEquipe = vi.fn(async () => acessoEquipeAtual);
const requireMaster = vi.fn(async () => acessoMaster);
vi.mock("@/lib/acesso", () => ({
  requireEquipe: () => requireEquipe(),
  requireEquipeEditar: () => requireEquipe(),
  requireMaster: () => requireMaster(),
  registrarAuditoria: vi.fn(async () => undefined),
}));
vi.mock("@/lib/equipe/envio", () => ({ enviarAcessoPeloVini: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

let linhas: Record<string, unknown> = {};
let respostaRpc: { data: unknown; error: unknown } = { data: "ok", error: null };
const rpc = vi.fn<(nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(
  async () => respostaRpc,
);
function consulta(tabela: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "in", "or", "order", "neq", "is"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: linhas[tabela] ?? null, error: null }));
  return q;
}
const admin = { rpc, from: vi.fn((tabela: string) => consulta(tabela)) };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

const { mensagemEditarVinculo, pedidoEdicaoValido } = await import("./regras");
const { textoSalvarEdicaoAcesso } = await import("@/components/equipe/textos");
const { editarAcessoMembroAction } = await import("@/app/(app)/equipe/actions");
const { editarVinculoAction } = await import("@/app/(app)/acessos/actions");

const VINCULO = "22222222-2222-4222-8222-222222222222";
const ALVO = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  acessoEquipeAtual = acessoGestao;
  respostaRpc = { data: "ok", error: null };
  linhas = {
    vinculos: {
      id: VINCULO,
      user_id: ALVO,
      organizacao_id: "org-a",
      unidade_id: "org-a-loja",
      role: "operacional",
      status: "ativo",
      whatsapp: null,
      acesso_envio_em: null,
    },
  };
});

describe("regras de editar acesso", () => {
  it("cada recusa do banco tem texto próprio; desconhecida vira erro (falha fechada)", () => {
    expect(mensagemEditarVinculo("ok")).toBeNull();
    expect(mensagemEditarVinculo("duplicado")).toMatch(/já tem esse acesso/);
    expect(mensagemEditarVinculo("proprio_vinculo")).toMatch(/próprio acesso/);
    expect(mensagemEditarVinculo("ultima_gestao")).toMatch(/última pessoa de gestão/);
    expect(mensagemEditarVinculo("fora_da_unidade")).toMatch(/sua unidade/);
    expect(mensagemEditarVinculo("qualquer")).toBe("Não foi possível editar o acesso.");
    expect(mensagemEditarVinculo(null)).toBe("Não foi possível editar o acesso.");
  });
  it("pedido só aceita gestão/operacional, uuid e id de unidade simples", () => {
    expect(pedidoEdicaoValido(VINCULO, "operacional", "org-a-loja")).toBe(true);
    expect(pedidoEdicaoValido(VINCULO, "gestao", null)).toBe(true);
    expect(pedidoEdicaoValido(VINCULO, "master", null)).toBe(false);
    expect(pedidoEdicaoValido("x", "gestao", null)).toBe(false);
    expect(pedidoEdicaoValido(VINCULO, "gestao", "a'; drop")).toBe(false);
    expect(pedidoEdicaoValido(VINCULO, "gestao", 5)).toBe(false);
  });
  it("o botão diz o efeito", () => {
    expect(textoSalvarEdicaoAcesso({ nome: "Ana", role: "operacional", unidadeNome: "Loja Centro" })).toBe(
      "Salvar: Ana passa a ser Operacional em Loja Centro",
    );
    expect(textoSalvarEdicaoAcesso({ nome: "Ana", role: "gestao", unidadeNome: null })).toBe(
      "Salvar: Ana passa a ser Gestão em todas as unidades",
    );
  });
});

describe("editarAcessoMembroAction (Equipe)", () => {
  it("dono edita: quem pede e a organização vêm da sessão", async () => {
    expect(await editarAcessoMembroAction(VINCULO, "gestao", null)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("editar_vinculo_acesso");
    expect(rpc.mock.calls[0][1]).toEqual({
      p_ator: acessoGestao.userId,
      p_vinculo_id: VINCULO,
      p_escopo: "equipe",
      p_organizacao_id: "org-a",
      p_novo_role: "gestao",
      p_nova_unidade_id: null,
    });
  });
  it("recusa do banco vira mensagem", async () => {
    respostaRpc = { data: "duplicado", error: null };
    expect(await editarAcessoMembroAction(VINCULO, "gestao", "org-a-loja")).toEqual({
      erro: mensagemEditarVinculo("duplicado"),
    });
  });
  it("promoção a master nem chega ao banco", async () => {
    expect(await editarAcessoMembroAction(VINCULO, "master", null)).toEqual({ erro: "Pedido inválido." });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("vínculo de outro cliente, master ou o próprio nem chega ao banco", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), organizacao_id: "org-b" };
    expect(await editarAcessoMembroAction(VINCULO, "gestao", null)).toEqual({ erro: "Acesso não encontrado." });
    linhas.vinculos = { ...(linhas.vinculos as object), organizacao_id: "org-a", role: "master" };
    expect(await editarAcessoMembroAction(VINCULO, "gestao", null)).toEqual({ erro: "Acesso não encontrado." });
    linhas.vinculos = { ...(linhas.vinculos as object), role: "operacional", user_id: acessoGestao.userId };
    expect(await editarAcessoMembroAction(VINCULO, "gestao", null)).toEqual({ erro: "Acesso não encontrado." });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("gestor de loja: vínculo de outra loja nem chega ao banco", async () => {
    acessoEquipeAtual = { ...acessoGestao, unidadeFixa: "org-a-outra" };
    expect(await editarAcessoMembroAction(VINCULO, "operacional", "org-a-loja")).toEqual({
      erro: "Acesso não encontrado.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("erro do banco vira mensagem genérica", async () => {
    respostaRpc = { data: null, error: { code: "42501" } };
    expect(await editarAcessoMembroAction(VINCULO, "gestao", null)).toEqual({
      erro: "Não foi possível editar o acesso.",
    });
  });
});

describe("editarVinculoAction (Acessos, master)", () => {
  it("master edita com escopo master e sem organização da sessão", async () => {
    expect(await editarVinculoAction(VINCULO, "operacional", "org-b-loja")).toEqual({ ok: true });
    expect(rpc.mock.calls[0][1]).toEqual({
      p_ator: acessoMaster.userId,
      p_vinculo_id: VINCULO,
      p_escopo: "master",
      p_organizacao_id: null,
      p_novo_role: "operacional",
      p_nova_unidade_id: "org-b-loja",
    });
  });
  it("vínculo master é recusado pelo banco com texto claro", async () => {
    respostaRpc = { data: "vinculo_master", error: null };
    expect(await editarVinculoAction(VINCULO, "gestao", null)).toEqual({
      erro: mensagemEditarVinculo("vinculo_master"),
    });
  });
  it("pedido fora do formato é recusado antes do banco", async () => {
    expect(await editarVinculoAction("nao-e-uuid", "gestao", null)).toEqual({ erro: "Pedido inválido." });
    expect(await editarVinculoAction(VINCULO, "master", null)).toEqual({ erro: "Pedido inválido." });
    expect(rpc).not.toHaveBeenCalled();
  });
});
