import { beforeEach, describe, expect, it, vi } from "vitest";

// Conferência da foto pela IA (12/11/2026) com banco, Storage e IA simulados. As regras de
// quem pode, do teto e da limpeza ao trocar a foto são provadas no banco
// (supabase/tests/database/garante_ia_fotos.sql); aqui, o que o servidor faz com cada resposta.

vi.mock("server-only", () => ({}));

const EXEC = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const CAMINHO = `loja/${EXEC}/${ITEM}-abcdef12.jpg`;
const CHAMADA = "33333333-3333-4333-8333-333333333333";

let reserva: { data: unknown; error: unknown };
let respostaGravada: Record<string, unknown> | null;
let gravou: { data: unknown; error: unknown };
let foto: { data: unknown; error: unknown };
const atualizacoes: Record<string, unknown>[] = [];

function consulta(tabela: string) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => {
      if (tabela === "garante_execucoes") return { data: { modelo_nome: "Fechamento", snapshot: [{ id: ITEM, titulo: "Balcão limpo" }] } };
      if (tabela === "garante_respostas") return { data: respostaGravada };
      return { data: null };
    },
  };
  return q;
}

const rpcUsuario = vi.fn(async () => reserva);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcUsuario, from: consulta }),
}));
const rpcAdmin = vi.fn(async () => gravou);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: rpcAdmin,
    storage: { from: () => ({ download: async () => foto }) },
    from: () => ({
      update: (dados: Record<string, unknown>) => {
        atualizacoes.push(dados);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

let respostaIa: { ok: true; texto: string; stopReason: string | null } | { ok: false; codigo: string };
const chamarIa = vi.fn(async () => respostaIa);
vi.mock("@/lib/conciliacao/ia-chamada", () => ({ chamarIa: (...a: unknown[]) => chamarIa(...(a as [])) }));

const { conferirFotoComIa } = await import("./ia-fotos-servidor");

beforeEach(() => {
  reserva = { data: { situacao: "reservada", chamada_id: CHAMADA }, error: null };
  respostaGravada = null;
  gravou = { data: true, error: null };
  foto = { data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), error: null };
  respostaIa = { ok: true, texto: '{"veredito":"reprovado","motivo":"Pote de comida na geladeira de bebidas."}', stopReason: "end_turn" };
  atualizacoes.length = 0;
  vi.clearAllMocks();
});

describe("conferir a foto com a IA", () => {
  it("reserva, chama a IA com a foto e grava o resultado", async () => {
    const r = await conferirFotoComIa(EXEC, ITEM, CAMINHO);
    expect(r).toEqual({ estado: "resultado", veredito: "reprovado", motivo: "Pote de comida na geladeira de bebidas." });
    expect(chamarIa).toHaveBeenCalledTimes(1);
    expect(rpcAdmin).toHaveBeenCalledWith("garante_ia_gravar_resultado", {
      p_chamada_id: CHAMADA,
      p_veredito: "reprovado",
      p_motivo: "Pote de comida na geladeira de bebidas.",
    });
  });

  it("teto do mês: não chama a IA", async () => {
    reserva = { data: { situacao: "limite" }, error: null };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "limite" });
    expect(chamarIa).not.toHaveBeenCalled();
  });

  it("unidade desligada: não chama a IA", async () => {
    reserva = { data: { situacao: "desligada" }, error: null };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "desligada" });
    expect(chamarIa).not.toHaveBeenCalled();
  });

  it("mesma foto de novo: devolve o resultado gravado, sem nova chamada", async () => {
    reserva = { data: { situacao: "repetida" }, error: null };
    respostaGravada = { ia_veredito: "aprovado", ia_motivo: "Balcão limpo e seco.", ia_foto_path: CAMINHO };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "resultado", veredito: "aprovado", motivo: "Balcão limpo e seco." });
    expect(chamarIa).not.toHaveBeenCalled();
  });

  it("resultado gravado de outra foto não vale para esta", async () => {
    reserva = { data: { situacao: "repetida" }, error: null };
    respostaGravada = { ia_veredito: "aprovado", ia_motivo: "ok", ia_foto_path: "outra.jpg" };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "falhou" });
  });

  it("IA falhou: não deu para conferir, nada gravado na resposta", async () => {
    respostaIa = { ok: false, codigo: "ia_sem_resposta" };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "falhou" });
    expect(rpcAdmin).not.toHaveBeenCalled();
  });

  it("sem chave da IA: fecha a reserva como erro, sem custo", async () => {
    respostaIa = { ok: false, codigo: "ia_sem_chave" };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "falhou" });
    expect(atualizacoes[0]).toMatchObject({ situacao: "erro", resultado_codigo: "ia_sem_chave", custo_estimado_usd: null });
  });

  it("foto sumiu do Storage: não chama a IA e fecha a reserva", async () => {
    foto = { data: null, error: { message: "not found" } };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "falhou" });
    expect(chamarIa).not.toHaveBeenCalled();
    expect(atualizacoes[0]).toMatchObject({ situacao: "erro", resultado_codigo: "foto_indisponivel" });
  });

  it("foto trocada enquanto a IA olhava: resultado não aparece", async () => {
    gravou = { data: false, error: null };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "falhou" });
  });

  it("resposta fora do esquema: não deu para conferir", async () => {
    respostaIa = { ok: true, texto: "não sei", stopReason: "end_turn" };
    expect(await conferirFotoComIa(EXEC, ITEM, CAMINHO)).toEqual({ estado: "falhou" });
  });
});
