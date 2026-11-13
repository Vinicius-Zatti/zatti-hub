import { describe, expect, it } from "vitest";
import {
  CATALOGO,
  ehNotaBaixa,
  lerPerguntas,
  normalizarWhatsapp,
  perguntasAtivas,
  perguntasPadrao,
  validarPerguntas,
  validarRespostas, ehOrigem, lerOrigens } from "./perguntas";

describe("modelo de perguntas", () => {
  it("nasce com as 6 perguntas ligadas, na ordem do catálogo", () => {
    expect(perguntasPadrao().map((p) => p.chave)).toEqual(["atendimento", "comida", "espera", "nps", "conheceu", "comentario"]);
    expect(perguntasPadrao().every((p) => p.ativa)).toBe(true);
  });

  it("lê o JSON do banco na ordem certa; chave faltando entra desligada", () => {
    const lidas = lerPerguntas([
      { chave: "nps", texto: "Indicaria?", ativa: true },
      { chave: "lixo", texto: "x", ativa: true },
    ]);
    expect(lidas).toHaveLength(CATALOGO.length);
    expect(lidas.find((p) => p.chave === "nps")).toEqual({ chave: "nps", texto: "Indicaria?", ativa: true });
    expect(lidas.find((p) => p.chave === "comida")?.ativa).toBe(false);
    expect(lerPerguntas(null)).toHaveLength(6);
  });

  it("valida: texto de 3 a 200 letras e ao menos uma ligada", () => {
    expect(validarPerguntas(perguntasPadrao()).ok).toBe(true);
    const curta = perguntasPadrao().map((p) => (p.chave === "comida" ? { ...p, texto: "ok" } : p));
    expect(validarPerguntas(curta)).toMatchObject({ ok: false });
    const todasDesligadas = perguntasPadrao().map((p) => ({ ...p, ativa: false }));
    expect(validarPerguntas(todasDesligadas)).toEqual({ ok: false, erro: "Deixe ao menos uma pergunta ligada." });
    const repetida = [...perguntasPadrao().slice(0, 5), perguntasPadrao()[0]];
    expect(validarPerguntas(repetida).ok).toBe(false);
    expect(validarPerguntas(perguntasPadrao().slice(0, 5)).ok).toBe(false);
  });
});

describe("respostas da página pública", () => {
  const perguntas = perguntasAtivas(perguntasPadrao());

  it("aceita resposta completa e converte as notas em número", () => {
    const r = validarRespostas(perguntas, { atendimento: "5", comida: "4", espera: "ate_15", nps: "10", conheceu: "instagram", comentario: " Ótimo! " });
    expect(r).toEqual({ ok: true, respostas: { atendimento: 5, comida: 4, espera: "ate_15", nps: 10, conheceu: "instagram", comentario: "Ótimo!" } });
  });

  it("obrigatória em branco, nota fora da escala ou opção estranha não passa", () => {
    expect(validarRespostas(perguntas, { comida: "4", espera: "ate_15", nps: "9" })).toMatchObject({ ok: false, chave: "atendimento" });
    expect(validarRespostas(perguntas, { atendimento: "6", comida: "4", espera: "ate_15", nps: "9" })).toMatchObject({ ok: false, chave: "atendimento" });
    expect(validarRespostas(perguntas, { atendimento: "3", comida: "4", espera: "ate_15", nps: "11" })).toMatchObject({ ok: false, chave: "nps" });
    expect(validarRespostas(perguntas, { atendimento: "3", comida: "4", espera: "2 horas", nps: "9" })).toMatchObject({ ok: false, chave: "espera" });
  });

  it("opcionais podem ficar em branco; Outro guarda o texto curto", () => {
    const base = { atendimento: "3", comida: "4", espera: "de_15_a_30", nps: "0" };
    expect(validarRespostas(perguntas, base)).toEqual({ ok: true, respostas: { atendimento: 3, comida: 4, espera: "de_15_a_30", nps: 0 } });
    expect(validarRespostas(perguntas, { ...base, conheceu: "outro", conheceu_outro: " Rádio " })).toMatchObject({
      ok: true,
      respostas: { conheceu: "outro", conheceu_outro: "Rádio" },
    });
    expect(validarRespostas(perguntas, { ...base, comentario: "x".repeat(1001) })).toMatchObject({ ok: false, chave: "comentario" });
  });

  it("pergunta desligada não é cobrada nem gravada", () => {
    const semComida = perguntasAtivas(perguntasPadrao().map((p) => (p.chave === "comida" ? { ...p, ativa: false } : p)));
    expect(validarRespostas(semComida, { atendimento: "5", comida: "1", espera: "ate_15", nps: "9" })).toEqual({
      ok: true,
      respostas: { atendimento: 5, espera: "ate_15", nps: 9 },
    });
  });
});

describe("nota baixa e WhatsApp", () => {
  it("nota baixa: atendimento ou comida até 2, ou indicaria até 6", () => {
    expect(ehNotaBaixa({ atendimento: 2, comida: 5, nps: 10 })).toBe(true);
    expect(ehNotaBaixa({ atendimento: 3, comida: 2, nps: 10 })).toBe(true);
    expect(ehNotaBaixa({ atendimento: 3, comida: 3, nps: 6 })).toBe(true);
    expect(ehNotaBaixa({ atendimento: 3, comida: 3, nps: 7 })).toBe(false);
    expect(ehNotaBaixa({ atendimento: null, comida: null, nps: null })).toBe(false);
  });

  it("WhatsApp vira 55 + DDD + número; número curto ou estranho é recusado", () => {
    expect(normalizarWhatsapp("(16) 99999-0001")).toBe("5516999990001");
    expect(normalizarWhatsapp("+55 16 3333-4444")).toBe("551633334444");
    expect(normalizarWhatsapp("99999-0001")).toBeNull();
    expect(normalizarWhatsapp("0016999990001")).toBeNull();
  });
});

describe("tipos de pesquisa (13/11/2026)", () => {
  it("salão, delivery próprio e apps; o resto não é origem", () => {
    expect(ehOrigem("app")).toBe(true);
    expect(ehOrigem("ifood")).toBe(false);
  });
  it("lerOrigens mantém a ordem fixa e, sem dado, liga os três", () => {
    expect(lerOrigens(["app", "salao"])).toEqual(["salao", "app"]);
    expect(lerOrigens(["x"])).toEqual(["salao", "delivery", "app"]);
    expect(lerOrigens(null)).toEqual(["salao", "delivery", "app"]);
  });
});
