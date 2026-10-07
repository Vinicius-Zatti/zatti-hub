import { describe, expect, it } from "vitest";
import { ErroPublico } from "./erros";
import {
  WHATSAPP_VINICIUS,
  formatarDataHoraSuporte,
  identificadorDoErro,
  montarLinkSuporteWhatsApp,
  montarMensagemSuporte,
} from "./suporte";

// 28/09/2026 23:07 em Brasília (UTC-3).
const MOMENTO = new Date("2026-09-29T02:07:00Z");

describe("mensagem de suporte do cartão de erro", () => {
  it("monta o texto pronto com unidade, tela, data/hora e identificador", () => {
    expect(
      montarMensagemSuporte({ unidade: "The House - Matriz", tela: "/estoque/cmv", momento: MOMENTO, identificador: "1234567890" }),
    ).toBe(
      [
        "Oi Vinícius, deu erro no Zatti Hub.",
        "Unidade: The House - Matriz",
        "Tela: /estoque/cmv",
        "Data e hora: 28/09/2026 23:07",
        "Identificador do erro: 1234567890",
      ].join("\n"),
    );
  });

  it("data e hora sempre no horário de Brasília", () => {
    expect(formatarDataHoraSuporte(new Date("2026-01-01T02:59:00Z"))).toBe("31/12/2025 23:59");
  });

  it("link do WhatsApp com o número único e o texto codificado", () => {
    const link = montarLinkSuporteWhatsApp({
      unidade: "Adega & Cia #1",
      tela: "/painel",
      momento: MOMENTO,
      identificador: "abc",
    });
    expect(link.startsWith(`https://wa.me/${WHATSAPP_VINICIUS}?text=`)).toBe(true);
    const texto = link.split("?text=")[1];
    // Nada de &, #, espaço ou quebra de linha cru que corte o parâmetro.
    expect(texto).not.toMatch(/[&#\s]/);
    expect(decodeURIComponent(texto)).toContain("Unidade: Adega & Cia #1");
    expect(new URL(link).searchParams.get("text")).toBe(
      montarMensagemSuporte({ unidade: "Adega & Cia #1", tela: "/painel", momento: MOMENTO, identificador: "abc" }),
    );
  });

  it("tela sem parâmetros de busca nem âncora (não vaza filtro, id ou dado)", () => {
    const texto = montarMensagemSuporte({
      unidade: "U",
      tela: "/financeiro-gerencial/lancamentos/despesas?de=2026-09-01&cliente=Fulano#linha",
      momento: MOMENTO,
      identificador: null,
    });
    expect(texto).toContain("Tela: /financeiro-gerencial/lancamentos/despesas\n");
    expect(texto).not.toContain("Fulano");
    expect(texto).not.toContain("?");
  });

  it("identificador comprido ou com várias linhas vira uma linha curta (sem stack)", () => {
    const stack = `Error: select * from fin_lancamentos where senha='x'\n    at buscarTudo (paginacao.ts:30)\n${"x".repeat(500)}`;
    const texto = montarMensagemSuporte({ unidade: "U", tela: "/", momento: MOMENTO, identificador: stack });
    const linha = texto.split("\n").find((l) => l.startsWith("Identificador do erro:"))!;
    expect(texto.split("\n")).toHaveLength(5);
    expect(linha.length).toBeLessThanOrEqual("Identificador do erro: ".length + 120);
    expect(texto).not.toContain("paginacao.ts");
  });

  it("sem unidade e sem identificador usa textos neutros", () => {
    const texto = montarMensagemSuporte({ unidade: null, tela: "", momento: MOMENTO, identificador: null });
    expect(texto).toContain("Unidade: não identificada");
    expect(texto).toContain("Tela: /");
    expect(texto).toContain("Identificador do erro: não informado");
  });

  it("identificador: digest do Next ou mensagem pública, nunca a mensagem crua", () => {
    expect(identificadorDoErro(Object.assign(new Error("select * from perfis"), { digest: "987654321" }))).toBe("987654321");
    expect(identificadorDoErro(new ErroPublico("Recorrência não encontrada."))).toBe("Recorrência não encontrada.");
    expect(identificadorDoErro(new Error("relation fin_baixas: permission denied"))).toBeNull();
  });
});

describe("código de erro do navegador", () => {
  it("tem o formato NAV- + 6 caracteres sem letras ambíguas", async () => {
    const { gerarCodigoErroNavegador, FORMATO_CODIGO_ERRO_NAVEGADOR } = await import("./suporte");
    for (let i = 0; i < 50; i++) {
      expect(gerarCodigoErroNavegador()).toMatch(FORMATO_CODIGO_ERRO_NAVEGADOR);
    }
    expect(gerarCodigoErroNavegador(() => 0)).toBe("NAV-AAAAAA");
    expect(gerarCodigoErroNavegador(() => 0.9999999)).toBe("NAV-999999");
  });

  it("vai na mensagem de suporte no lugar do 'não informado'", async () => {
    const { montarMensagemSuporte } = await import("./suporte");
    const texto = montarMensagemSuporte({ unidade: "x", tela: "/estoque/produtos/edicao", momento: MOMENTO, identificador: "NAV-ABC234" });
    expect(texto).toContain("Identificador do erro: NAV-ABC234");
  });
});

describe("texto de erro do navegador para o log", () => {
  it("tira e-mail, URL, token e número longo, e corta", async () => {
    const { sanitizarTextoErroParaLog } = await import("./suporte");
    const texto = sanitizarTextoErroParaLog(
      "Falha para ana@exemplo.com em https://x.com/a?b=1 token eyJhbGciOiJIUzI1NiIsInR5cCI6 cpf 123.456.789-00\nlinha 2",
    );
    expect(texto).toBe("Falha para [email] em [url] token [token] cpf [numero] linha 2");
    expect(sanitizarTextoErroParaLog("ab ".repeat(200), 10)).toHaveLength(10);
  });

  it("mantém a mensagem técnica comum legível", async () => {
    const { sanitizarTextoErroParaLog } = await import("./suporte");
    expect(sanitizarTextoErroParaLog("Cannot read properties of undefined (reading 'nome')")).toBe(
      "Cannot read properties of undefined (reading 'nome')",
    );
  });
});
