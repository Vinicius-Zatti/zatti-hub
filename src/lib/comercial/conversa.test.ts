import { describe, expect, it } from "vitest";
import { falaDe, lerFalaMensagem, rpcDoEvento, separarConversa } from "@/lib/comercial/conversa";
import { descreverEventos, SUGESTAO_ETAPA, type EventoLead } from "@/lib/comercial/funil";
import { readFileSync } from "node:fs";

const ev = (p: Partial<EventoLead> & Pick<EventoLead, "tipo" | "em">): EventoLead => ({
  id: p.id ?? `${p.tipo}-${p.em}`,
  deEtapa: null,
  paraEtapa: null,
  produto: "",
  valor: null,
  texto: "",
  autor: "sdr",
  ...p,
});

describe("rpcDoEvento", () => {
  it("mensagem vai para a RPC que só arquiva", () => {
    expect(rpcDoEvento({ tipo: "mensagem", chave: "msg-1" })).toBe("zh_leads_registrar_mensagem");
  });
  it("negociação vai para a RPC que move o card até a reunião de diagnóstico", () => {
    expect(rpcDoEvento({ tipo: "negociacao", chave: "negociacao-1" })).toBe("zh_leads_registrar_negociacao");
  });
  it("formulário, pagamento, etapa e tipo desconhecido seguem a entrada de sempre", () => {
    for (const tipo of ["formulario", "pagamento", "etapa", "outro", undefined]) {
      expect(rpcDoEvento({ tipo })).toBe("zh_leads_registrar_evento");
    }
    expect(rpcDoEvento(null)).toBe("zh_leads_registrar_evento");
  });
});

describe("lerFalaMensagem", () => {
  it("aceita só o contrato {de, canal}", () => {
    expect(lerFalaMensagem({ de: "lead", canal: "whatsapp" })).toEqual({ de: "lead", canal: "whatsapp" });
    expect(lerFalaMensagem({ de: "vinicius", canal: "instagram" })).toEqual({ de: "vinicius", canal: "instagram" });
    expect(lerFalaMensagem({ de: "cliente", canal: "whatsapp" })).toBeNull();
    expect(lerFalaMensagem({ de: "sdr", canal: "email" })).toBeNull();
    expect(lerFalaMensagem(null)).toBeNull();
  });
});

describe("separarConversa", () => {
  const eventos = [
    ev({ tipo: "criado", em: "2026-11-17T10:00:00Z", paraEtapa: "comecar_a_seguir" }),
    ev({ tipo: "mensagem", em: "2026-11-17T12:05:00Z", texto: "Fechado", mensagem: { de: "lead", canal: "whatsapp" } }),
    ev({ tipo: "mensagem", em: "2026-11-17T12:00:00Z", texto: "Oi", mensagem: { de: "sdr", canal: "whatsapp" } }),
    ev({ tipo: "etapa", em: "2026-11-17T12:01:00Z", paraEtapa: "abordado" }),
  ];

  it("tira as mensagens da linha do tempo e ordena a conversa da mais antiga para a mais recente", () => {
    const { conversa, linhaDoTempo } = separarConversa(eventos);
    expect(conversa.map((e) => e.texto)).toEqual(["Oi", "Fechado"]);
    expect(linhaDoTempo.map((e) => e.tipo)).toEqual(["criado", "etapa"]);
    expect(descreverEventos(linhaDoTempo)).toHaveLength(2);
  });

  it("quem falou vem de dados.de; sem isso, do autor gravado", () => {
    expect(falaDe(eventos[1])).toBe("lead");
    expect(falaDe(ev({ tipo: "mensagem", em: "x", autor: "vinicius" }))).toBe("vinicius");
    expect(falaDe(ev({ tipo: "mensagem", em: "x", autor: "sdr" }))).toBe("sdr");
  });
});

describe("zh_leads_registrar_negociacao", () => {
  it("trata como automáticas todas as sugestões de etapa da ficha (a ação de Vinícius é a que ele escreveu)", () => {
    const sql = readFileSync("supabase/migrations/20261118130000_comercial_vini_reuniao_diagnostico.sql", "utf8");
    for (const texto of Object.values(SUGESTAO_ETAPA)) expect(sql).toContain(`'${texto.replace(/'/g, "''")}'`);
  });
});
