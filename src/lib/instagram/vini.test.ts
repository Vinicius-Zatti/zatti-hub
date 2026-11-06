import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AVISO_VINI_FORA, enviarAutomacaoInstagram, enviarPalavraInstagram, lerInstagram } from "@/lib/instagram/vini";

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.VINI_URL = "https://vini.exemplo/";
  process.env.ZATTI_HUB_OPERACAO_TOKEN = "tok";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.VINI_URL;
  delete process.env.ZATTI_HUB_OPERACAO_TOKEN;
});

const automacao = { link: "https://www.instagram.com/reel/DfAbC123/", palavra: "cardapio", direct: "Oi, segue.", linkEntrega: null };

describe("cliente do Vini (Instagram)", () => {
  it("lê com token, sem cache e sem seguir redirecionamento", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true, automacao: { ligada: true, palavras: [], ultimos: [] } }));
    const r = await lerInstagram();
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://vini.exemplo/zatti-hub/instagram");
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "manual" });
    expect(init.headers["x-envio-token"]).toBe("tok");
  });

  it("sem env ou sem HTTPS não chama e avisa", async () => {
    delete process.env.ZATTI_HUB_OPERACAO_TOKEN;
    expect(await lerInstagram()).toEqual({ ok: false, mensagem: AVISO_VINI_FORA });
    process.env.ZATTI_HUB_OPERACAO_TOKEN = "tok";
    process.env.VINI_URL = "http://vini.exemplo";
    expect((await enviarPalavraInstagram({ codigo: "DfAbC123", ativa: false })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Vini fora do ar ou fora do contrato vira aviso", async () => {
    fetchMock.mockRejectedValueOnce(new Error("rede"));
    expect(await lerInstagram()).toEqual({ ok: false, mensagem: AVISO_VINI_FORA });
    fetchMock.mockResolvedValueOnce(resposta(503, { erro: "sem segredo" }));
    expect((await lerInstagram()).ok).toBe(false);
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }));
    expect((await lerInstagram()).ok).toBe(false);
  });

  it("escritas vão às rotas do contrato e devolvem o erro em português", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }));
    expect(await enviarPalavraInstagram({ codigo: "DfAbC123", ativa: false })).toEqual({ ok: true });
    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://vini.exemplo/zatti-hub/instagram/palavra");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ codigo: "DfAbC123", ativa: false });

    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }));
    expect(await enviarAutomacaoInstagram(automacao)).toEqual({ ok: true });
    [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://vini.exemplo/zatti-hub/instagram/automacao");
    expect(JSON.parse(init.body)).toEqual(automacao);

    fetchMock.mockResolvedValueOnce(resposta(409, { ok: false, erro: "Esse post já tem Direct." }));
    expect(await enviarAutomacaoInstagram(automacao)).toEqual({ ok: false, mensagem: "Esse post já tem Direct." });

    fetchMock.mockResolvedValueOnce(resposta(404, {}));
    const n = await enviarPalavraInstagram({ codigo: "DfAbC123", ativa: true });
    expect(n.ok === false && n.mensagem).toMatch(/não encontrou/);

    fetchMock.mockResolvedValueOnce(resposta(401, {}));
    const c = await enviarPalavraInstagram({ codigo: "DfAbC123", ativa: true });
    expect(c.ok === false && c.mensagem).toMatch(/Nada foi alterado/);

    fetchMock.mockRejectedValueOnce(Object.assign(new Error("tempo"), { name: "AbortError" }));
    const t = await enviarAutomacaoInstagram(automacao);
    expect(t.ok === false && t.mensagem).toMatch(/pode já ter sido feita/);
  });
});
