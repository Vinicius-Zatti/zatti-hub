import { beforeEach, describe, expect, it, vi } from "vitest";

// Trava de CNPJ único do certificado SEFAZ (26/11): certificado removido em outra unidade não
// prende o CNPJ; ativo lá, ou com XML já descido lá, continua travando. Certificado é simulado.
type Chamada = { tabela: string; op: string; valor?: unknown; filtros: [string, unknown][] };
const banco = vi.hoisted(() => ({
  existente: null as null | { id: string; unidade_id: string; ativo: boolean },
  xmlSalvos: 0,
  gravouLinha: true,
  chamadas: [] as Chamada[],
}));
const auditoria = vi.hoisted(() => vi.fn());

function consulta(tabela: string) {
  const c: Chamada = { tabela, op: "select", filtros: [] };
  banco.chamadas.push(c);
  const q = {
    select: () => q,
    insert: (v: unknown) => ((c.op = "insert"), (c.valor = v), q),
    update: (v: unknown) => ((c.op = "update"), (c.valor = v), q),
    eq: (k: string, v: unknown) => (c.filtros.push([k, v]), q),
    maybeSingle: async () => ({ data: banco.existente, error: null }),
    single: async () => (banco.gravouLinha ? { data: { id: banco.existente?.id ?? "novo" }, error: null } : { data: null, error: { code: "PGRST116" } }),
    then: (ok: (r: unknown) => void) => ok({ count: banco.xmlSalvos, error: null }),
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acesso", () => ({
  requireMaster: vi.fn(async () => ({ role: "master", unidadeId: "visconde", userId: "u1" })),
  registrarAuditoria: auditoria,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: consulta }) }));
vi.mock("@/lib/sefaz/certificado", () => ({
  TAMANHO_MAXIMO_PFX: 50 * 1024,
  UFS: ["SP"],
  chavePublicaRobo: () => "chave",
  lerCertificado: () => ({ cnpj: "12345678000199", titular: "VISCONDE LTDA", validoAte: "2099-01-01T00:00:00Z" }),
  cifrarParaRobo: () => ({ chave: "c", iv: "i", tag: "t", dados: "d" }),
}));

const { salvarCertificadoAction } = await import("@/app/(app)/configuracoes/sefaz-actions");

function formulario() {
  const f = new FormData();
  f.set("certificado", new File([new Uint8Array([1, 2, 3])], "c.pfx"));
  f.set("senha", "x");
  f.set("uf", "SP");
  return f;
}
const gravacao = () => banco.chamadas.find((c) => c.tabela === "fin_sefaz_certificados" && c.op !== "select");

beforeEach(() => {
  banco.existente = null;
  banco.xmlSalvos = 0;
  banco.gravouLinha = true;
  banco.chamadas = [];
  auditoria.mockReset();
});

describe("salvarCertificadoAction: CNPJ em outra unidade", () => {
  it("removido em outra unidade e sem XML: a unidade da sessão assume e a fila recomeça", async () => {
    banco.existente = { id: "c1", unidade_id: "betones", ativo: false };
    expect((await salvarCertificadoAction(formulario())).ok).toBe(true);
    const g = gravacao()!;
    expect(g.op).toBe("update");
    expect(g.valor).toMatchObject({ unidade_id: "visconde", ativo: true, ult_nsu: "0", max_nsu: null });
    expect(g.filtros).toEqual([["id", "c1"], ["ativo", false]]);
    const notas = banco.chamadas.find((c) => c.tabela === "fin_sefaz_notas")!;
    expect(notas.filtros).toEqual([["certificado_id", "c1"], ["situacao", "xml_salvo"]]);
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "assumir_certificado_sefaz" }));
  });

  it("ainda ativo em outra unidade: continua travado", async () => {
    banco.existente = { id: "c1", unidade_id: "betones", ativo: true };
    const r = await salvarCertificadoAction(formulario());
    expect(r).toEqual({ ok: false, mensagem: "Este CNPJ já tem certificado em outra unidade do Zatti Hub." });
    expect(gravacao()).toBeUndefined();
  });

  it("removido em outra unidade mas com XML já descido lá: não muda de unidade sozinho", async () => {
    banco.existente = { id: "c1", unidade_id: "betones", ativo: false };
    banco.xmlSalvos = 3;
    const r = await salvarCertificadoAction(formulario());
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("já trouxe notas em outra unidade");
    expect(gravacao()).toBeUndefined();
  });

  it("outra unidade assumiu antes (update não acha linha inativa): não grava nem audita", async () => {
    banco.existente = { id: "c1", unidade_id: "betones", ativo: false };
    banco.gravouLinha = false;
    expect((await salvarCertificadoAction(formulario())).ok).toBe(false);
    expect(auditoria).not.toHaveBeenCalled();
  });

  it("renovação na mesma unidade mantém o NSU", async () => {
    banco.existente = { id: "c1", unidade_id: "visconde", ativo: false };
    expect((await salvarCertificadoAction(formulario())).ok).toBe(true);
    const g = gravacao()!;
    expect(g.valor).not.toHaveProperty("ult_nsu");
    expect(g.valor).not.toHaveProperty("unidade_id");
    expect(g.filtros).toEqual([["id", "c1"], ["unidade_id", "visconde"]]);
    expect(auditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: "trocar_certificado_sefaz" }));
  });

  it("CNPJ novo: insere na unidade da sessão", async () => {
    expect((await salvarCertificadoAction(formulario())).ok).toBe(true);
    expect(gravacao()).toMatchObject({ op: "insert", valor: { unidade_id: "visconde", cnpj: "12345678000199" } });
  });
});
