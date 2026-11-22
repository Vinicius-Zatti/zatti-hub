import { describe, expect, it } from "vitest";
import {
  diariaValida,
  formatarWhatsapp,
  mensagemCodigo,
  nomeArquivoArteFreela,
  nomeDiferente,
  normalizarWhatsapp,
  resumoDoDia,
  situacaoTitulo,
  urlPublicaFreela,
  validarCheckin,
  valorSugerido,
} from "./regras";

describe("Freelancers: regras", () => {
  it("WhatsApp: normaliza com 55 e formata para leitura", () => {
    expect(normalizarWhatsapp("(16) 99999-0001")).toBe("5516999990001");
    expect(normalizarWhatsapp("+55 16 99999-0001")).toBe("5516999990001");
    expect(normalizarWhatsapp("99999-0001")).toBeNull();
    expect(formatarWhatsapp("5516999990001")).toBe("(16) 99999-0001");
    expect(formatarWhatsapp("551633330001")).toBe("(16) 3333-0001");
  });

  it("valor sugerido: diária do cadastro, senão a padrão da unidade", () => {
    expect(valorSugerido(180, 150)).toBe(180);
    expect(valorSugerido(null, 150)).toBe(150);
    expect(valorSugerido(null, null)).toBeNull();
  });

  it("diária válida: de R$ 1 a R$ 10.000, até centavos", () => {
    expect(diariaValida(150)).toBe(true);
    expect(diariaValida(150.5)).toBe(true);
    expect(diariaValida(0)).toBe(false);
    expect(diariaValida(10001)).toBe(false);
    expect(diariaValida(150.555)).toBe(false);
    expect(diariaValida(null)).toBe(false);
  });

  it("resumo do dia: soma só as conferidas e separa o que o caixa pagou", () => {
    const r = resumoDoDia([
      { estado: "conferido", valor: 150, pagoNoCaixa: true },
      { estado: "conferido", valor: 180.1, pagoNoCaixa: false },
      { estado: "pendente", valor: null, pagoNoCaixa: false },
      { estado: "recusado", valor: null, pagoNoCaixa: false },
    ]);
    expect(r).toEqual({ total: 4, pendentes: 1, conferidos: 2, recusados: 1, valorConferido: 330.1, pagoNoCaixa: 150, aPagar: 180.1 });
  });

  it("nome digitado diferente do cadastro vira alerta; primeiro nome ou acento não", () => {
    expect(nomeDiferente("João da Silva", "joao")).toBe(false);
    expect(nomeDiferente("João da Silva", "João da Silva")).toBe(false);
    expect(nomeDiferente("João da Silva", "Pedro")).toBe(true);
    expect(nomeDiferente("João da Silva", null)).toBe(false);
  });

  it("situação do título em linguagem simples", () => {
    const base = { lancamentoId: null, tituloGeradoEm: null, tituloAviso: null, pagoNoCaixa: false, tituloARemover: null };
    expect(situacaoTitulo({ ...base, estado: "pendente" })).toBe("Aguardando conferência");
    expect(situacaoTitulo({ ...base, estado: "conferido", lancamentoId: "x", pagoNoCaixa: true })).toBe("No Contas a Pagar, já pago pelo caixa");
    expect(situacaoTitulo({ ...base, estado: "conferido", lancamentoId: "x" })).toBe("No Contas a Pagar, em aberto");
    expect(situacaoTitulo({ ...base, estado: "conferido", tituloAviso: "mes_fechado" })).toContain("mês está fechado");
    expect(situacaoTitulo({ ...base, estado: "conferido", tituloGeradoEm: "2026-11-22T12:00:00Z" })).toBe("Título apagado no Financeiro");
  });

  it("check-in: exige WhatsApp e nome; função é opcional", () => {
    expect(validarCheckin({ whatsapp: null, nome: "Ana", funcao: "" })).toMatchObject({ ok: false, campo: "whatsapp" });
    expect(validarCheckin({ whatsapp: "5516999990001", nome: " A ", funcao: "" })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarCheckin({ whatsapp: "5516999990001", nome: "  Ana   Paula ", funcao: "" })).toEqual({ ok: true, nome: "Ana Paula", funcao: null });
    expect(validarCheckin({ whatsapp: "5516999990001", nome: "Ana", funcao: "x" })).toMatchObject({ ok: false, campo: "funcao" });
  });

  it("endereço público e nome do arquivo da arte", () => {
    expect(urlPublicaFreela("lucaskinhas-pinhal", "https://zatti-hub.vercel.app/")).toBe("https://zatti-hub.vercel.app/freela/lucaskinhas-pinhal");
    expect(() => urlPublicaFreela("../x", "https://zatti-hub.vercel.app")).toThrow();
    expect(nomeArquivoArteFreela("loja", "pdf")).toBe("qr-checkin-freelancer-loja.pdf");
  });

  it("todo código do banco tem mensagem própria", () => {
    for (const c of ["mes_fechado", "sem_conta_caixa", "ja_pago", "whatsapp_repetido", "ja_conferido", "dia_invalido"]) {
      expect(mensagemCodigo(c)).not.toBe(mensagemCodigo("desconhecido"));
    }
  });
});
