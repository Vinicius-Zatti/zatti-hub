import { describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Ponta a ponta LOCAL (opt-in): Auth, PostgREST, Storage e Postgres reais do
// `supabase start`, com a fixture `scripts/garante/fixture-local.sql`.
// Nunca aponta para produção: exige URL localhost.
// GARANTE_E2E_URL, GARANTE_E2E_ANON e GARANTE_E2E_SERVICE no ambiente.

const url = process.env.GARANTE_E2E_URL ?? "";
const ativo = /^http:\/\/(127\.0\.0\.1|localhost):/.test(url) && Boolean(process.env.GARANTE_E2E_SERVICE);
const anon = process.env.GARANTE_E2E_ANON ?? "";
const service = process.env.GARANTE_E2E_SERVICE ?? "";
const PUBLICACAO = "00000000-0000-0000-0000-0000000e2ed1";
const ITEM_CHECK = "00000000-0000-0000-0000-0000000e2ec1";
const ITEM_TEMP = "00000000-0000-0000-0000-0000000e2ec2";
const ITEM_ESTRELAS = "00000000-0000-0000-0000-0000000e2ec3";
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
// JPEG mínimo válido (1x1).
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

describe.skipIf(!ativo)("Checklist Garante ponta a ponta local", () => {
  it("operador cumpre o checklist com foto e o banco calcula a meta", async () => {
    const sb = createClient(url, anon, { auth: { persistSession: false } });
    const { error: erroLogin } = await sb.auth.signInWithPassword({ email: "e2e.garante@teste.local", password: "senha-local-e2e" });
    expect(erroLogin).toBeNull();

    const { data: agenda, error: erroAgenda } = await sb.rpc("garante_agenda", { p_unidade_id: "uni-e2e-garante", p_data: hoje() });
    expect(erroAgenda).toBeNull();
    expect((agenda as { publicacao_id: string }[]).some((l) => l.publicacao_id === PUBLICACAO)).toBe(true);

    const { data: execucaoId, error: erroInicio } = await sb.rpc("garante_iniciar", { p_publicacao_id: PUBLICACAO, p_data: hoje() });
    expect(erroInicio).toBeNull();

    const responder = (item: string, extra: Record<string, unknown>) =>
      sb.rpc("garante_responder", { p_execucao_id: execucaoId, p_item_id: item, ...extra });
    expect((await responder(ITEM_CHECK, { p_valor_bool: true })).data).toBe(true);
    expect((await responder(ITEM_TEMP, { p_valor_numero: 7 })).data).toBe(false);
    expect((await responder(ITEM_ESTRELAS, { p_valor_numero: 5 })).data).toBe(true);

    const { data: faltam } = await sb.rpc("garante_concluir", { p_execucao_id: execucaoId });
    expect(faltam).toBe(1); // foto obrigatória da temperatura

    const caminho = `uni-e2e-garante/${execucaoId}/${ITEM_TEMP}-${randomUUID()}.jpg`;
    const { error: erroUpload } = await sb.storage.from("garante-evidencias").upload(caminho, JPEG, { contentType: "image/jpeg" });
    expect(erroUpload).toBeNull();
    const { error: erroFoto } = await sb.rpc("garante_registrar_foto", { p_execucao_id: execucaoId, p_item_id: ITEM_TEMP, p_caminho: caminho });
    expect(erroFoto).toBeNull();

    const { data: assinada } = await sb.storage.from("garante-evidencias").createSignedUrl(caminho, 60);
    expect(assinada?.signedUrl).toBeTruthy();

    expect((await sb.rpc("garante_concluir", { p_execucao_id: execucaoId })).data).toBe(0);
    const { error: erroDepois } = await responder(ITEM_CHECK, { p_valor_bool: false });
    expect(erroDepois?.message).toContain("execucao_concluida");

    // Fase 2a: a execução guardou a janela; operacional não lê a nota.
    const { data: agendaDepois } = await sb.rpc("garante_agenda", { p_unidade_id: "uni-e2e-garante", p_data: hoje() });
    const linha = (agendaDepois as { publicacao_id: string; abre_em: string; fecha_em: string }[]).find((l) => l.publicacao_id === PUBLICACAO)!;
    expect(new Date(linha.fecha_em).getTime() - new Date(linha.abre_em).getTime()).toBe((720 + 1440) * 60_000);
    const { error: erroNotaOperador } = await sb.rpc("garante_nota", { p_unidade_id: "uni-e2e-garante", p_de: hoje(), p_ate: hoje() });
    expect(erroNotaOperador?.message).toContain("sem_permissao");

    // Gestão lê a nota de hoje: o checklist concluído no prazo dá 100 em P e E.
    const gestao = createClient(url, anon, { auth: { persistSession: false } });
    expect((await gestao.auth.signInWithPassword({ email: "e2e.garante.gestao@teste.local", password: "senha-local-e2e" })).error).toBeNull();
    const { data: nota, error: erroNota } = await gestao.rpc("garante_nota", { p_unidade_id: "uni-e2e-garante", p_de: hoje(), p_ate: hoje() });
    expect(erroNota).toBeNull();
    const unidade = (nota as { nivel: string; previstas: number; execucao: number; versao_formula: number }[]).find((l) => l.nivel === "unidade")!;
    expect(unidade.previstas).toBe(1);
    expect(Number(unidade.execucao)).toBe(100);
    expect(unidade.versao_formula).toBe(1);
  });
});

describe.skipIf(!ativo)("Equipe ponta a ponta local (primeiro acesso)", () => {
  it("conta pendente não vê nada; depois da troca a sessão antiga cai e a nova entra", async () => {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const email = `e2e.equipe.${Date.now()}@teste.local`;
    const provisoria = "abcDEF234xyz";
    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: provisoria,
      email_confirm: true,
      app_metadata: { zh_pendente: true },
    });
    expect(erroCriar).toBeNull();
    const userId = criado.user!.id;
    await admin.from("perfis").insert({ id: userId, nome: "Teste Equipe" });
    const { data: vinculo } = await admin
      .from("vinculos")
      .insert({ user_id: userId, organizacao_id: "org-e2e-garante", unidade_id: "uni-e2e-garante", role: "operacional", status: "convidado", whatsapp: "+5531999990000" })
      .select("id")
      .single();
    const hash = createHash("sha256").update(`${userId}:${provisoria}`).digest("hex");
    await admin.from("senhas_temporarias").insert({
      user_id: userId,
      vinculo_id: vinculo!.id,
      hash,
      expira_em: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    const antiga = createClient(url, anon, { auth: { persistSession: false } });
    expect((await antiga.auth.signInWithPassword({ email, password: provisoria })).error).toBeNull();
    expect((await antiga.from("unidades").select("id").eq("id", "uni-e2e-garante")).data).toEqual([]);

    const { data: trava } = await admin.rpc("iniciar_primeiro_acesso", { p_user_id: userId, p_hash: hash });
    expect(trava).toBeTruthy();
    const nova = "senha-nova-da-pessoa-123";
    expect((await admin.auth.admin.updateUserById(userId, { password: nova, app_metadata: { zh_pendente: false } })).error).toBeNull();
    expect((await admin.rpc("concluir_primeiro_acesso", { p_user_id: userId, p_token: trava })).data).toBe(true);

    // Sessão aberta antes da troca: o banco recusa, mesmo com token ainda válido.
    expect((await antiga.from("unidades").select("id").eq("id", "uni-e2e-garante")).data).toEqual([]);
    expect((await antiga.rpc("sessao_vigente")).data).toBe(false);

    await new Promise((r) => setTimeout(r, 1100));
    const atual = createClient(url, anon, { auth: { persistSession: false } });
    expect((await atual.auth.signInWithPassword({ email, password: nova })).error).toBeNull();
    expect((await atual.from("unidades").select("id").eq("id", "uni-e2e-garante")).data).toEqual([{ id: "uni-e2e-garante" }]);
    expect((await atual.rpc("sessao_vigente")).data).toBe(true);

    await admin.auth.admin.deleteUser(userId);
  });
});
