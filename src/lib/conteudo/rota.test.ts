import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

const { GET, POST, PATCH } = await import("@/app/api/conteudo/pecas/route");

const TOKEN = "t".repeat(64);
const URL_BASE = "http://localhost/api/conteudo/pecas";
const ID = "951c48a3-7b87-409c-b14c-59a5ae670d30";

function req(metodo: string, corpo?: unknown, { token = TOKEN, url = URL_BASE }: { token?: string; url?: string } = {}) {
  return new NextRequest(url, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

beforeEach(() => {
  rpc.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.local";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("rota /api/conteudo/pecas", () => {
  it("sem token ou token curto: 401 sem chamar o banco", async () => {
    const r = await GET(req("GET", undefined, { token: "curto" }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: "não autorizado" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("GET repassa o período e devolve { pecas }", async () => {
    rpc.mockResolvedValue({ data: { pecas: [{ id: ID }] }, error: null });
    const r = await GET(req("GET", undefined, { url: `${URL_BASE}?de=2026-10-06&ate=2026-10-12` }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ pecas: [{ id: ID }] });
    expect(rpc).toHaveBeenCalledWith("conteudo_api_listar", { p_token: TOKEN, p_de: "2026-10-06", p_ate: "2026-10-12" });
  });

  it("GET com período inválido: 400", async () => {
    const r = await GET(req("GET", undefined, { url: `${URL_BASE}?de=2026-10-06` }));
    expect(r.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("POST nova: 201; já existente pelo origem_notion_id: 200 com a peça atual", async () => {
    rpc.mockResolvedValueOnce({ data: { peca: { id: ID, versao: 1 }, existente: false }, error: null });
    const nova = await POST(req("POST", { titulo: "Peça", status: "Ideia" }));
    expect(nova.status).toBe(201);
    expect((await nova.json()).peca).toEqual({ id: ID, versao: 1 });

    rpc.mockResolvedValueOnce({ data: { peca: { id: ID, versao: 4 }, existente: true }, error: null });
    const existente = await POST(req("POST", { titulo: "Outro", origem_notion_id: "3f308b75-d0a3-81b7" }));
    expect(existente.status).toBe(200);
    expect(await existente.json()).toEqual({ peca: { id: ID, versao: 4 }, existente: true });
    expect(rpc).toHaveBeenLastCalledWith("conteudo_api_criar", {
      p_token: TOKEN,
      p_peca: { titulo: "Outro", origem_notion_id: "3f308b75-d0a3-81b7" },
    });
  });

  it("POST: json inválido e campo fora da lista dão 400", async () => {
    expect((await POST(req("POST", "{sem json"))).status).toBe(400);
    const r = await POST(req("POST", { titulo: "x", status: "Publicado" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ erro: "campo inválido: status" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("corpo acima do limite em bytes: 413", async () => {
    // 70 mil "ç" = 140 KB em UTF-8 (passa do teto de 128 KB mesmo com menos caracteres que isso).
    const r = await POST(req("POST", { titulo: "x", roteiro: "ç".repeat(70_000) }));
    expect(r.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("PATCH: versão divergente vira 409, peça inexistente 404, token recusado 401", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "Versao divergente" } });
    expect((await PATCH(req("PATCH", { id: ID, versao: 1, status: "Gravado" }))).status).toBe(409);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "Peca nao encontrada" } });
    expect((await PATCH(req("PATCH", { id: ID, versao: 1, status: "Gravado" }))).status).toBe(404);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Nao autorizado" } });
    expect((await PATCH(req("PATCH", { id: ID, versao: 1, status: "Gravado" }))).status).toBe(401);
  });

  it("PATCH ok repassa id, versão e só os campos enviados", async () => {
    rpc.mockResolvedValueOnce({ data: { peca: { id: ID, versao: 2 }, existente: true }, error: null });
    const r = await PATCH(req("PATCH", { id: ID, versao: 1, status: "Publicado todos", data: null }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ peca: { id: ID, versao: 2 } });
    expect(rpc).toHaveBeenCalledWith("conteudo_api_atualizar", {
      p_token: TOKEN,
      p_id: ID,
      p_versao: 1,
      p_campos: { status: "Publicado todos", data: null },
    });
  });
});
