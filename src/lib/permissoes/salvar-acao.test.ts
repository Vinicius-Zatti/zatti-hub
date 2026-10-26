import { beforeEach, describe, expect, it, vi } from "vitest";
import { niveisEfetivos } from "./modulos";

// Permissões por módulo (25/10/2026): a Server Action da Equipe com banco simulado. Quem pode e o
// que pode é provado no banco (supabase/tests/database/permissoes_por_modulo.sql); aqui, quem o
// servidor deixa passar, o que manda ao banco e o que faz com a resposta.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));

const base = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "gestao",
  organizacaoId: "org-a",
  organizacaoNome: "Cliente A",
  unidadeId: "zatti-burger",
  unidadeFixa: null as string | null,
  equipeHabilitado: true,
  areaInterna: false,
  ehDono: true,
  permissoes: niveisEfetivos("gestao", true, {}),
};
let acessoAtual: Record<string, unknown> = base;
const requireEquipe = vi.fn(async () => acessoAtual);
vi.mock("@/lib/acesso", () => ({
  requireEquipe: () => requireEquipe(),
  requireEquipeEditar: () => requireEquipe(),
  requireMaster: vi.fn(),
  registrarAuditoria: vi.fn(async () => undefined),
}));
vi.mock("@/lib/equipe/envio", () => ({ enviarAcessoPeloVini: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

let alvo: Record<string, unknown> | null = null;
let respostaRpc: { data: unknown; error: unknown } = { data: "ok", error: null };
const rpc = vi.fn<(nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(
  async () => respostaRpc,
);
function consulta() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "in", "or", "order", "neq", "is"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: alvo, error: null }));
  return q;
}
const admin = { rpc, from: vi.fn(() => consulta()) };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
// Titular da organização (26/10/2026): cada teste escolhe; padrão = sem titular (reserva).
let titularAtual: { vinculoId: string; userId: string } | null = null;
vi.mock("@/lib/equipe/titular-servidor", () => ({ carregarTitularOrganizacao: vi.fn(async () => titularAtual) }));


const { salvarPermissoesMembroAction } = await import("@/app/(app)/equipe/actions");

const VINCULO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  titularAtual = null;
  acessoAtual = base;
  respostaRpc = { data: "ok", error: null };
  alvo = {
    id: VINCULO,
    user_id: "33333333-3333-4333-8333-333333333333",
    organizacao_id: "org-a",
    unidade_id: "zatti-burger",
    role: "gestao",
    status: "ativo",
  };
});

describe("salvarPermissoesMembroAction", () => {
  it("dono grava: quem pede e a organização vêm da sessão", async () => {
    expect(await salvarPermissoesMembroAction(VINCULO, { financeiro: "ver" })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("salvar_permissoes_modulo", {
      p_ator: base.userId,
      p_organizacao_id: "org-a",
      p_vinculo_id: VINCULO,
      p_niveis: { financeiro: "ver" },
    });
  });

  it("master grava", async () => {
    acessoAtual = { ...base, role: "master", ehDono: false, permissoes: niveisEfetivos("master", true, {}) };
    expect(await salvarPermissoesMembroAction(VINCULO, { vendas: "sem_acesso" })).toEqual({ ok: true });
  });

  it("gerente de loja não chega ao banco", async () => {
    acessoAtual = { ...base, unidadeFixa: "zatti-burger", ehDono: false };
    expect(await salvarPermissoesMembroAction(VINCULO, { financeiro: "ver" })).toHaveProperty("erro");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dono sem Equipe em editar não administra", async () => {
    acessoAtual = { ...base, permissoes: niveisEfetivos("gestao", true, { equipe: "ver" }) };
    expect(await salvarPermissoesMembroAction(VINCULO, { financeiro: "ver" })).toHaveProperty("erro");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("área interna (fora da Navegação V2) não chega ao banco", async () => {
    acessoAtual = { ...base, areaInterna: true };
    expect(await salvarPermissoesMembroAction(VINCULO, { financeiro: "ver" })).toHaveProperty("erro");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pedido com chave ou nível desconhecido é recusado", async () => {
    expect(await salvarPermissoesMembroAction(VINCULO, { marketing: "ver" })).toEqual({ erro: "Pedido inválido." });
    expect(await salvarPermissoesMembroAction(VINCULO, { financeiro: "tudo" })).toEqual({ erro: "Pedido inválido." });
    expect(await salvarPermissoesMembroAction("x", {})).toEqual({ erro: "Pedido inválido." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("vínculo de outro cliente: mesma resposta de não encontrado", async () => {
    alvo = { ...(alvo as Record<string, unknown>), organizacao_id: "org-b" };
    expect(await salvarPermissoesMembroAction(VINCULO, {})).toEqual({ erro: "Acesso não encontrado." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("com titular marcado, a outra gestão de todas as unidades não é dona: o titular muda", async () => {
    titularAtual = { vinculoId: "44444444-4444-4444-8444-444444444444", userId: base.userId };
    alvo = { ...(alvo as Record<string, unknown>), unidade_id: null };
    expect(await salvarPermissoesMembroAction(VINCULO, {})).toEqual({ ok: true });
  });

  it("as permissões do titular só o master muda", async () => {
    titularAtual = { vinculoId: VINCULO, userId: "33333333-3333-4333-8333-333333333333" };
    expect(await salvarPermissoesMembroAction(VINCULO, {})).toEqual({
      erro: expect.stringMatching(/só a Zatti muda/),
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dono não muda outro dono (nem chega ao banco)", async () => {
    alvo = { ...(alvo as Record<string, unknown>), unidade_id: null };
    expect(await salvarPermissoesMembroAction(VINCULO, {})).toEqual({
      erro:
        "Essa pessoa também responde pelo cliente (gestão de todas as unidades, sem titular marcado). As permissões dela só a Zatti muda.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa do banco vira texto; erro do banco vira genérico", async () => {
    respostaRpc = { data: "acima_do_papel", error: null };
    expect(await salvarPermissoesMembroAction(VINCULO, { cardapio: "editar" })).toEqual({
      erro: 'Essa função não permite esse nível. Mude a função em "Editar acesso" primeiro.',
    });
    respostaRpc = { data: null, error: { code: "XX000" } };
    expect(await salvarPermissoesMembroAction(VINCULO, {})).toEqual({ erro: "Não foi possível salvar as permissões." });
  });
});
