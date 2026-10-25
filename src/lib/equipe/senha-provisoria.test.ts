import { beforeEach, describe, expect, it, vi } from "vitest";

// Senha provisória para conta que já existe (24/10/2026): regras puras e as
// duas Server Actions (Equipe e Acessos) com banco e WhatsApp simulados. A
// regra de quem pode é provada no banco (supabase/tests/database/
// senha_provisoria_conta_existente.sql); aqui, o que o servidor manda e faz
// com a resposta.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));

const acessoGestao = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "gestao",
  organizacaoId: "org-a",
  organizacaoNome: "Cliente A",
  unidadeId: "org-a-loja",
  unidadeFixa: null,
  equipeHabilitado: true,
};
const acessoMaster = { ...acessoGestao, userId: "99999999-9999-4999-8999-999999999999", role: "master" };

const requireEquipe = vi.fn(async () => acessoGestao);
const requireMaster = vi.fn(async () => acessoMaster);
vi.mock("@/lib/acesso", () => ({
  requireEquipe: () => requireEquipe(),
  requireMaster: () => requireMaster(),
  registrarAuditoria: vi.fn(async () => undefined),
}));

const enviarAcessoPeloVini = vi.fn<(dados: Record<string, unknown>) => Promise<"aceito">>(async () => "aceito");
vi.mock("@/lib/equipe/envio", () => ({ enviarAcessoPeloVini: (d: Record<string, unknown>) => enviarAcessoPeloVini(d) }));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Banco simulado: cada tabela devolve uma linha fixa; o rpc devolve o código escolhido.
let linhas: Record<string, unknown> = {};
let respostaRpc: { data: unknown; error: unknown } = { data: "ok", error: null };
const rpc = vi.fn<(nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(
  async () => respostaRpc,
);
function consulta(tabela: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "in", "or", "order", "neq", "is"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: linhas[tabela] ?? null, error: null }));
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
  return q;
}
const admin = {
  rpc,
  from: vi.fn((tabela: string) => consulta(tabela)),
  auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: "pessoa@teste.local" } }, error: null })) } },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

const { mensagemGerarProvisoria, formatarValidadeProvisoria } = await import("./regras");
const { hashSenhaTemporaria, gerarSenhaProvisoriaNoBanco } = await import("./servidor");
const { gerarSenhaProvisoriaMembroAction } = await import("@/app/(app)/equipe/actions");
const { gerarSenhaProvisoriaAction } = await import("@/app/(app)/acessos/actions");

const VINCULO = "22222222-2222-4222-8222-222222222222";
const ALVO = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  respostaRpc = { data: "ok", error: null };
  linhas = {
    vinculos: {
      id: VINCULO,
      user_id: ALVO,
      organizacao_id: "org-a",
      unidade_id: "org-a-loja",
      role: "operacional",
      status: "ativo",
      whatsapp: "+5531999990004",
      acesso_envio_em: null,
      organizacoes: { nome: "Cliente A" },
    },
    perfis: { nome: "Pessoa" },
  };
});

describe("mensagemGerarProvisoria", () => {
  it("ok não tem mensagem; cada recusa tem texto próprio", () => {
    expect(mensagemGerarProvisoria("ok")).toBeNull();
    expect(mensagemGerarProvisoria("outra_organizacao")).toMatch(/outro cliente/);
    expect(mensagemGerarProvisoria("limite")).toMatch(/2 minutos/);
    expect(mensagemGerarProvisoria("propria_conta")).toMatch(/Esqueci minha senha/);
    expect(mensagemGerarProvisoria("sem_permissao")).toMatch(/permissão/);
  });
  it("resposta desconhecida vira erro (falha fechada)", () => {
    expect(mensagemGerarProvisoria("qualquer")).toBe("Não foi possível gerar a senha provisória.");
    expect(mensagemGerarProvisoria(null)).toBe("Não foi possível gerar a senha provisória.");
  });
});

describe("formatarValidadeProvisoria", () => {
  it("mostra DD/MM/AAAA e hora de Brasília", () => {
    expect(formatarValidadeProvisoria(new Date("2026-10-31T17:30:00Z"))).toBe("31/10/2026 às 14:30");
    // Virada de dia em UTC continua no dia certo em Brasília.
    expect(formatarValidadeProvisoria(new Date("2026-11-01T01:15:00Z"))).toBe("31/10/2026 às 22:15");
  });
});

describe("gerarSenhaProvisoriaNoBanco", () => {
  it("manda só o hash da provisória e devolve a senha com ok", async () => {
    const r = await gerarSenhaProvisoriaNoBanco(admin as never, {
      atorId: "ator", vinculoId: VINCULO, alvoUserId: ALVO, escopo: "equipe", organizacaoId: "org-a",
    });
    expect(r.codigo).toBe("ok");
    expect(r.senha).toMatch(/^[A-Za-z0-9]{12}$/);
    const args = rpc.mock.calls[0][1];
    expect(rpc.mock.calls[0][0]).toBe("gerar_senha_provisoria_conta");
    expect(args.p_hash).toBe(hashSenhaTemporaria(ALVO, r.senha!));
    expect(JSON.stringify(args)).not.toContain(r.senha!);
    const dias = (new Date(String(args.p_expira_em)).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThanOrEqual(7);
  });
  it("recusa ou erro do banco não devolve senha", async () => {
    respostaRpc = { data: "outra_organizacao", error: null };
    expect((await gerarSenhaProvisoriaNoBanco(admin as never, {
      atorId: "a", vinculoId: VINCULO, alvoUserId: ALVO, escopo: "equipe", organizacaoId: "org-a",
    })).senha).toBeNull();
    respostaRpc = { data: null, error: { code: "42501" } };
    const r = await gerarSenhaProvisoriaNoBanco(admin as never, {
      atorId: "a", vinculoId: VINCULO, alvoUserId: ALVO, escopo: "master", organizacaoId: null,
    });
    expect(r).toMatchObject({ codigo: "erro", senha: null });
  });
});

describe("gerarSenhaProvisoriaMembroAction (Equipe)", () => {
  it("gestão gera: quem pede vem da sessão e a provisória vai pelo WhatsApp", async () => {
    const r = await gerarSenhaProvisoriaMembroAction(VINCULO);
    expect(r).toEqual({ ok: true, envio: "aceito" });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_ator: acessoGestao.userId, p_vinculo_id: VINCULO, p_escopo: "equipe", p_organizacao_id: "org-a",
    });
    const envio = enviarAcessoPeloVini.mock.calls[0][0];
    expect(envio).toMatchObject({ tipo: "conta_nova", whatsapp: "+5531999990004", organizacaoNome: "Cliente A" });
    expect(String(envio.senhaTemporaria)).toMatch(/^[A-Za-z0-9]{12}$/);
    // A gestão nunca recebe a senha na resposta.
    expect(JSON.stringify(r)).not.toContain(String(envio.senhaTemporaria));
  });
  it("conta com vínculo em outra organização: recusa clara e nada é enviado", async () => {
    respostaRpc = { data: "outra_organizacao", error: null };
    const r = await gerarSenhaProvisoriaMembroAction(VINCULO);
    expect(r).toEqual({ erro: mensagemGerarProvisoria("outra_organizacao") });
    expect(enviarAcessoPeloVini).not.toHaveBeenCalled();
  });
  it("operacional recusado pelo banco não envia nada", async () => {
    respostaRpc = { data: "sem_permissao", error: null };
    expect(await gerarSenhaProvisoriaMembroAction(VINCULO)).toEqual({ erro: mensagemGerarProvisoria("sem_permissao") });
    expect(enviarAcessoPeloVini).not.toHaveBeenCalled();
  });
  it("sem WhatsApp não chega a trocar a senha", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), whatsapp: null };
    const r = await gerarSenhaProvisoriaMembroAction(VINCULO);
    expect("erro" in r && r.erro).toMatch(/WhatsApp/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("vínculo de outro cliente nem chega ao banco", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), organizacao_id: "org-b" };
    expect(await gerarSenhaProvisoriaMembroAction(VINCULO)).toEqual({ erro: "Acesso não encontrado." });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("acesso revogado não gera", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), status: "revogado" };
    const r = await gerarSenhaProvisoriaMembroAction(VINCULO);
    expect("erro" in r).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("gerarSenhaProvisoriaAction (Acessos, master)", () => {
  it("master gera para qualquer conta e vê a provisória uma vez", async () => {
    const r = await gerarSenhaProvisoriaAction(VINCULO, false);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_ator: acessoMaster.userId, p_vinculo_id: VINCULO, p_escopo: "master", p_organizacao_id: null,
    });
    expect(r).toMatchObject({ ok: true, envio: null });
    if ("erro" in r) throw new Error(r.erro);
    expect(r.senha).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(r.validaAte).toMatch(/^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/);
    expect(enviarAcessoPeloVini).not.toHaveBeenCalled();
  });
  it("com WhatsApp do vínculo, envia quando o master pede", async () => {
    const r = await gerarSenhaProvisoriaAction(VINCULO, true);
    expect(r).toMatchObject({ ok: true, envio: "aceito" });
    expect(enviarAcessoPeloVini.mock.calls[0][0]).toMatchObject({ tipo: "conta_nova", organizacaoNome: "Cliente A" });
  });
  it("pedir envio sem WhatsApp cadastrado não troca a senha", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), whatsapp: null };
    const r = await gerarSenhaProvisoriaAction(VINCULO, true);
    expect("erro" in r).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("recusa do banco vira mensagem e não devolve senha", async () => {
    respostaRpc = { data: "propria_conta", error: null };
    expect(await gerarSenhaProvisoriaAction(VINCULO, false)).toEqual({ erro: mensagemGerarProvisoria("propria_conta") });
  });
  it("id fora do formato é recusado antes do banco", async () => {
    expect(await gerarSenhaProvisoriaAction("nao-e-uuid", false)).toEqual({ erro: "Pedido inválido." });
    expect(rpc).not.toHaveBeenCalled();
  });
});
