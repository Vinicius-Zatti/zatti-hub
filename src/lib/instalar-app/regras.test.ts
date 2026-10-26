import { describe, expect, it } from "vitest";
import { deveMostrarConvite, detectarPlataforma, lerRecusa, modoConvite, SCRIPT_CAPTURA_INSTALACAO } from "./regras";

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UA_CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const UA_IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const UA_SAMSUNG =
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
const UA_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const AGORA = Date.UTC(2026, 9, 26, 12);
const DIA = 24 * 60 * 60 * 1000;
const base = { standalone: false, instalado: false, recusadoEm: null, agora: AGORA } as const;

describe("detectarPlataforma", () => {
  it("iPhone no Safari e no Chrome", () => {
    expect(detectarPlataforma(UA_IPHONE, 5)).toBe("ios");
    expect(detectarPlataforma(UA_CHROME_IOS, 5)).toBe("ios");
  });
  it("iPad que se apresenta como Mac é iOS pela tela de toque; Mac de verdade é computador", () => {
    expect(detectarPlataforma(UA_IPAD, 5)).toBe("ios");
    expect(detectarPlataforma(UA_IPAD, 0)).toBe("computador");
  });
  it("Android no Chrome e no Samsung Internet", () => {
    expect(detectarPlataforma(UA_ANDROID, 5)).toBe("android");
    expect(detectarPlataforma(UA_SAMSUNG, 5)).toBe("android");
  });
  it("Windows é computador, mesmo com tela de toque", () => {
    expect(detectarPlataforma(UA_WINDOWS, 10)).toBe("computador");
  });
});

describe("deveMostrarConvite", () => {
  it("mostra no celular fora do app instalado", () => {
    expect(deveMostrarConvite({ ...base, plataforma: "ios" })).toBe(true);
    expect(deveMostrarConvite({ ...base, plataforma: "android" })).toBe(true);
  });
  it("nunca no computador", () => {
    expect(deveMostrarConvite({ ...base, plataforma: "computador" })).toBe(false);
  });
  it("nunca rodando instalado (standalone) nem depois de instalar", () => {
    expect(deveMostrarConvite({ ...base, plataforma: "ios", standalone: true })).toBe(false);
    expect(deveMostrarConvite({ ...base, plataforma: "android", standalone: true })).toBe(false);
    expect(deveMostrarConvite({ ...base, plataforma: "android", instalado: true })).toBe(false);
  });
  it("recusado há menos de 7 dias esconde; com 7 dias ou mais volta", () => {
    expect(deveMostrarConvite({ ...base, plataforma: "android", recusadoEm: AGORA - DIA })).toBe(false);
    expect(deveMostrarConvite({ ...base, plataforma: "ios", recusadoEm: AGORA - 7 * DIA + 1 })).toBe(false);
    expect(deveMostrarConvite({ ...base, plataforma: "ios", recusadoEm: AGORA - 7 * DIA })).toBe(true);
    expect(deveMostrarConvite({ ...base, plataforma: "android", recusadoEm: AGORA - 30 * DIA })).toBe(true);
  });
  it("recusa com data no futuro (relógio voltou) continua escondendo", () => {
    expect(deveMostrarConvite({ ...base, plataforma: "android", recusadoEm: AGORA + DIA })).toBe(false);
  });
});

describe("lerRecusa", () => {
  it("aceita só número gravado pelo próprio cartão", () => {
    expect(lerRecusa(String(AGORA))).toBe(AGORA);
    expect(lerRecusa(null)).toBeNull();
    expect(lerRecusa("")).toBeNull();
    expect(lerRecusa("ontem")).toBeNull();
    expect(lerRecusa("-5")).toBeNull();
  });
});

describe("modoConvite", () => {
  it("iOS sempre ensina os passos", () => {
    expect(modoConvite("ios", false)).toBe("passos-ios");
    expect(modoConvite("ios", true)).toBe("passos-ios");
  });
  it("Android com o pedido do Chrome mostra o botão; sem ele, os passos", () => {
    expect(modoConvite("android", true)).toBe("botao-nativo");
    expect(modoConvite("android", false)).toBe("passos-android");
  });
});

describe("SCRIPT_CAPTURA_INSTALACAO", () => {
  it("é JavaScript válido e só escuta os eventos de instalação", () => {
    expect(() => new Function(SCRIPT_CAPTURA_INSTALACAO)).not.toThrow();
    expect(SCRIPT_CAPTURA_INSTALACAO).toContain("beforeinstallprompt");
    expect(SCRIPT_CAPTURA_INSTALACAO).toContain("appinstalled");
  });
});
