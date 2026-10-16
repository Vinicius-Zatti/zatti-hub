import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AVISO_VINI_FORA, enviarAcaoOperacao, enviarEstadoTarefa, lerOperacao } from "@/lib/operacao/vini";

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

describe("cliente do Vini", () => {
  it("lê com token, sem cache e sem seguir redirecionamento", async () => {
    fetchMock.mockResolvedValue(resposta(200, { geradoEm: 1, itens: [], tarefas: [] }));
    const r = await lerOperacao();
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://vini.exemplo/zatti-hub/operacao");
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "manual" });
    expect(init.headers["x-envio-token"]).toBe("tok");
  });

  it("sem env ou sem HTTPS não chama e avisa", async () => {
    delete process.env.ZATTI_HUB_OPERACAO_TOKEN;
    expect(await lerOperacao()).toEqual({ ok: false, mensagem: AVISO_VINI_FORA });
    process.env.ZATTI_HUB_OPERACAO_TOKEN = "tok";
    process.env.VINI_URL = "http://vini.exemplo";
    expect((await enviarEstadoTarefa({ id: "ATA-1#1", estado: "feito" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Vini fora do ar ou fora do contrato vira aviso", async () => {
    fetchMock.mockRejectedValueOnce(new Error("rede"));
    expect(await lerOperacao()).toEqual({ ok: false, mensagem: AVISO_VINI_FORA });
    fetchMock.mockResolvedValueOnce(resposta(503, { erro: "sem segredo" }));
    expect((await lerOperacao()).ok).toBe(false);
    fetchMock.mockResolvedValueOnce(resposta(200, { itens: "x" }));
    expect((await lerOperacao()).ok).toBe(false);
  });

  it("escrita devolve o erro em português do Vini", async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { ok: true }));
    expect(await enviarAcaoOperacao({ chave: "demanda:TH-1", acao: "resolver" })).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://vini.exemplo/zatti-hub/operacao/acao");
    expect(JSON.parse(init.body)).toEqual({ chave: "demanda:TH-1", acao: "resolver" });

    fetchMock.mockResolvedValueOnce(resposta(409, { ok: false, erro: "Essa ata já foi aprovada." }));
    expect(await enviarAcaoOperacao({ chave: "ata:ATA-1", acao: "aprovar" })).toEqual({ ok: false, mensagem: "Essa ata já foi aprovada." });

    fetchMock.mockResolvedValueOnce(resposta(401, {}));
    const r = await enviarEstadoTarefa({ id: "ATA-1#1", estado: "feito" });
    expect(r.ok === false && r.mensagem).toMatch(/Nada foi alterado/);

    fetchMock.mockRejectedValueOnce(Object.assign(new Error("tempo"), { name: "AbortError" }));
    const t = await enviarAcaoOperacao({ chave: "ata:ATA-1", acao: "aprovar" });
    expect(t.ok === false && t.mensagem).toMatch(/pode já ter sido feita/);
  });
});
