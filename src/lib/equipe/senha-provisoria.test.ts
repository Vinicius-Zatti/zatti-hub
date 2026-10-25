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
const registrarAuditoria = vi.fn<(p: Record<string, unknown>) => Promise<void>>(async () => undefined);
vi.mock("@/lib/acesso", () => ({
  requireEquipe: () => requireEquipe(),
  requireMaster: () => requireMaster(),
  registrarAuditoria: (p: Record<string, unknown>) => registrarAuditoria(p),
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

const { mensagemGerarProvisoria, formatarValidadeProvisoria, whatsappTrocadoHaPouco } = await import("./regras");
const { hashSenhaTemporaria, gerarSenhaProvisoriaNoBanco } = await import("./servidor");
const { gerarSenhaProvisoriaMembroAction, atualizarWhatsappMembroAction, reenviarAcessoMembroAction } = await import(
  "@/app/(app)/equipe/actions"
);
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
      whatsapp_alterado_em: null,
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

describe("proteções da revisão de segurança", () => {
  it("mensagens próprias para WhatsApp trocado e teto por pessoa", () => {
    expect(mensagemGerarProvisoria("whatsapp_recente")).toBe(
      "O WhatsApp desta pessoa mudou agora há pouco. Por segurança, espere 30 minutos ou peça à Zatti.",
    );
    expect(mensagemGerarProvisoria("limite_ator")).toMatch(/10 minutos/);
  });
  it("whatsappTrocadoHaPouco: 30 minutos, falha fechada", () => {
    const agora = new Date("2026-10-25T12:00:00Z");
    expect(whatsappTrocadoHaPouco(null, agora)).toBe(false);
    expect(whatsappTrocadoHaPouco("2026-10-25T11:45:00Z", agora)).toBe(true);
    expect(whatsappTrocadoHaPouco("2026-10-25T11:29:00Z", agora)).toBe(false);
    expect(whatsappTrocadoHaPouco("data-quebrada", agora)).toBe(true);
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
  it("audita o resultado do envio (sem a senha)", async () => {
    await gerarSenhaProvisoriaMembroAction(VINCULO);
    const auditoria = registrarAuditoria.mock.calls.find((c) => c[0].acao === "senha_provisoria_envio")?.[0];
    expect(auditoria).toMatchObject({ entidadeId: ALVO, dadosNovos: { vinculoId: VINCULO, envio: "aceito", exibidaNaTela: false } });
    const senha = String(enviarAcessoPeloVini.mock.calls[0][0].senhaTemporaria);
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toContain(senha);
  });
  it("WhatsApp trocado há pouco: mensagem do banco chega à tela", async () => {
    respostaRpc = { data: "whatsapp_recente", error: null };
    expect(await gerarSenhaProvisoriaMembroAction(VINCULO)).toEqual({ erro: mensagemGerarProvisoria("whatsapp_recente") });
    expect(enviarAcessoPeloVini).not.toHaveBeenCalled();
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

describe("troca de WhatsApp e reenvio (Equipe)", () => {
  it("auditoria guarda só os 4 finais do número antigo e do novo", async () => {
    expect(await atualizarWhatsappMembroAction(VINCULO, "31 98888-7777")).toEqual({ ok: true });
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({
      acao: "equipe_editar_whatsapp",
      dadosAntigos: { whatsappFinal: "0004" },
      dadosNovos: { whatsappFinal: "7777" },
    });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toContain("98888");
  });
  it("senha redefinida não é reenviada para número trocado há pouco", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), whatsapp_alterado_em: new Date().toISOString() };
    linhas.senhas_temporarias = { vinculo_id: VINCULO, origem: "redefinicao", user_id: ALVO };
    expect(await reenviarAcessoMembroAction(VINCULO)).toEqual({ erro: mensagemGerarProvisoria("whatsapp_recente") });
    expect(rpc).not.toHaveBeenCalled();
    expect(enviarAcessoPeloVini).not.toHaveBeenCalled();
  });
  it("conta nova (cadastro) continua podendo reenviar depois de corrigir o número", async () => {
    linhas.vinculos = { ...(linhas.vinculos as object), whatsapp_alterado_em: new Date().toISOString() };
    linhas.senhas_temporarias = { vinculo_id: VINCULO, origem: "cadastro", user_id: ALVO };
    respostaRpc = { data: true, error: null };
    expect(await reenviarAcessoMembroAction(VINCULO)).toEqual({ ok: true, envio: "aceito" });
    expect(rpc.mock.calls[0][0]).toBe("rotacionar_senha_temporaria");
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
    expect(registrarAuditoria.mock.calls[0][0]).toMatchObject({
      acao: "senha_provisoria_exibida",
      entidadeId: ALVO,
      dadosNovos: { vinculoId: VINCULO, exibidaNaTela: true, envio: null },
    });
    expect(JSON.stringify(registrarAuditoria.mock.calls)).not.toContain(r.senha);
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
