import { describe, expect, it } from "vitest";
import {
  CATALOGO_EDITAVEL,
  NAO_LEMBRO,
  ehNotaBaixa,
  humorDaAvaliacao,
  lerPerguntas,
  normalizarAtendentes,
  normalizarWhatsapp,
  perguntasDoTipo,
  perguntasPadrao,
  validarPerguntas,
  validarRespostas,
  ehOrigem,
  lerOrigens,
} from "./perguntas";

describe("modelo de perguntas (13/11/2026)", () => {
  it("nasce com as perguntas novas; quem atendeu vem desligada", () => {
    const padrao = perguntasPadrao();
    expect(padrao.map((p) => p.chave)).toEqual([
      "atendimento",
      "pedido_certo",
      "comida",
      "embalagem",
      "tempo",
      "entrega",
      "atendimento_pedido",
      "ambiente",
      "atendente",
      "nps",
      "comentario",
      "conheceu",
    ]);
    expect(padrao.filter((p) => !p.ativa).map((p) => p.chave)).toEqual(["atendente"]);
  });

  it("cada tipo de pesquisa tem as próprias perguntas", () => {
    const chaves = (o: "salao" | "delivery" | "app", nomes: string[] = []) => perguntasDoTipo(perguntasPadrao(), o, nomes).map((p) => p.chave);
    expect(chaves("salao")).toEqual(["atendimento", "comida", "tempo", "ambiente", "nps", "comentario", "conheceu"]);
    expect(chaves("delivery")).toEqual(["pedido_certo", "comida", "embalagem", "entrega", "atendimento_pedido", "nps", "comentario"]);
    expect(chaves("app")).toEqual(["pedido_certo", "comida", "embalagem", "nps", "comentario"]);
    const comAtendente = perguntasPadrao().map((p) => (p.chave === "atendente" ? { ...p, ativa: true } : p));
    // Ligada mas sem nome cadastrado: não aparece.
    expect(perguntasDoTipo(comAtendente, "salao").some((p) => p.chave === "atendente")).toBe(false);
    expect(perguntasDoTipo(comAtendente, "salao", ["Bruno"]).some((p) => p.chave === "atendente")).toBe(true);
    expect(perguntasDoTipo(comAtendente, "app", ["Bruno"]).some((p) => p.chave === "atendente")).toBe(false);
  });

  it("lê o JSON do banco na ordem certa; chave faltando entra desligada (versão antiga de 6)", () => {
    const lidas = lerPerguntas([
      { chave: "nps", texto: "Indicaria?", ativa: true },
      { chave: "espera", texto: "Quanto tempo?", ativa: true },
      { chave: "lixo", texto: "x", ativa: true },
    ]);
    expect(lidas).toHaveLength(CATALOGO_EDITAVEL.length);
    expect(lidas.find((p) => p.chave === "nps")).toEqual({ chave: "nps", texto: "Indicaria?", ativa: true });
    expect(lidas.find((p) => p.chave === "comida")?.ativa).toBe(false);
    expect(lidas.some((p) => p.chave === "espera")).toBe(false);
  });

  it("valida: texto de 3 a 200 letras, todas as perguntas uma vez e ao menos uma ligada", () => {
    expect(validarPerguntas(perguntasPadrao()).ok).toBe(true);
    const curta = perguntasPadrao().map((p) => (p.chave === "comida" ? { ...p, texto: "ok" } : p));
    expect(validarPerguntas(curta)).toMatchObject({ ok: false });
    const todasDesligadas = perguntasPadrao().map((p) => ({ ...p, ativa: false }));
    expect(validarPerguntas(todasDesligadas)).toEqual({ ok: false, erro: "Deixe ao menos uma pergunta ligada." });
    const repetida = [...perguntasPadrao().slice(0, -1), perguntasPadrao()[0]];
    expect(validarPerguntas(repetida).ok).toBe(false);
    expect(validarPerguntas(perguntasPadrao().slice(0, 5)).ok).toBe(false);
  });
});

describe("respostas da página pública", () => {
  const salao = perguntasDoTipo(perguntasPadrao(), "salao");
  const app = perguntasDoTipo(perguntasPadrao(), "app");
  const baseSalao = { atendimento: "5", comida: "4", tempo: "3", ambiente: "5", nps: "10" };

  it("aceita resposta completa e converte notas e sim/não", () => {
    expect(validarRespostas(salao, { ...baseSalao, conheceu: "instagram", comentario: " Ótimo! " })).toEqual({
      ok: true,
      respostas: { atendimento: 5, comida: 4, tempo: 3, ambiente: 5, nps: 10, conheceu: "instagram", comentario: "Ótimo!" },
    });
    expect(validarRespostas(app, { pedido_certo: "nao", comida: "4", embalagem: "2", nps: "7" })).toEqual({
      ok: true,
      respostas: { pedido_certo: false, comida: 4, embalagem: 2, nps: 7 },
    });
  });

  it("obrigatória em branco, nota fora da escala ou opção estranha não passa", () => {
    expect(validarRespostas(salao, { ...baseSalao, atendimento: "" })).toMatchObject({ ok: false, chave: "atendimento" });
    expect(validarRespostas(salao, { ...baseSalao, ambiente: "6" })).toMatchObject({ ok: false, chave: "ambiente" });
    expect(validarRespostas(salao, { ...baseSalao, nps: "11" })).toMatchObject({ ok: false, chave: "nps" });
    expect(validarRespostas(app, { pedido_certo: "talvez", comida: "4", embalagem: "2", nps: "7" })).toMatchObject({ ok: false, chave: "pedido_certo" });
  });

  it("pergunta de outro tipo não é cobrada nem gravada", () => {
    const r = validarRespostas(app, { pedido_certo: "sim", comida: "5", embalagem: "5", nps: "9", atendimento: "1", tempo: "1" });
    expect(r).toEqual({ ok: true, respostas: { pedido_certo: true, comida: 5, embalagem: 5, nps: 9 } });
  });

  it("quem atendeu: só nome da lista ou não lembro", () => {
    const comAtendente = perguntasDoTipo(
      perguntasPadrao().map((p) => (p.chave === "atendente" ? { ...p, ativa: true } : p)),
      "salao",
      ["Bruno"],
    );
    expect(validarRespostas(comAtendente, { ...baseSalao, atendente: "Bruno" }, ["Bruno"])).toMatchObject({ ok: true, respostas: { atendente: "Bruno" } });
    expect(validarRespostas(comAtendente, { ...baseSalao, atendente: NAO_LEMBRO }, ["Bruno"])).toMatchObject({ ok: true, respostas: { atendente: NAO_LEMBRO } });
    expect(validarRespostas(comAtendente, { ...baseSalao, atendente: "Zé" }, ["Bruno"])).toMatchObject({ ok: false, chave: "atendente" });
    expect(validarRespostas(comAtendente, baseSalao, ["Bruno"])).toMatchObject({ ok: true });
  });

  it("opcionais podem ficar em branco; Outro guarda o texto curto", () => {
    expect(validarRespostas(salao, { ...baseSalao, conheceu: "outro", conheceu_outro: " Rádio " })).toMatchObject({
      ok: true,
      respostas: { conheceu: "outro", conheceu_outro: "Rádio" },
    });
    expect(validarRespostas(salao, { ...baseSalao, comentario: "x".repeat(1001) })).toMatchObject({ ok: false, chave: "comentario" });
  });
});

describe("nota baixa, humor, nomes e WhatsApp", () => {
  it("nota baixa: qualquer estrela até 2, indicaria até 6 ou pedido errado", () => {
    expect(ehNotaBaixa({ atendimento: 2, comida: 5, nps: 10 })).toBe(true);
    expect(ehNotaBaixa({ embalagem: 1, nps: 10 })).toBe(true);
    expect(ehNotaBaixa({ comida: 3, nps: 6 })).toBe(true);
    expect(ehNotaBaixa({ pedido_certo: false, comida: 5, nps: 10 })).toBe(true);
    expect(ehNotaBaixa({ atendimento: 3, comida: 3, nps: 7, pedido_certo: true })).toBe(false);
    expect(ehNotaBaixa({})).toBe(false);
  });

  it("tom da pergunta final pela nota de indicação: 0 a 6 ruim, 7 e 8 médio (sem \"poxa\"), 9 e 10 ótimo", () => {
    expect(humorDaAvaliacao({ comida: 5, nps: 10 })).toBe("otimo");
    expect(humorDaAvaliacao({ comida: 5, nps: 6 })).toBe("ruim");
    expect(humorDaAvaliacao({ comida: 5, nps: 7 })).toBe("medio");
    expect(humorDaAvaliacao({ comida: 2, nps: 8 })).toBe("medio");
    expect(humorDaAvaliacao({ comida: 2, nps: 10 })).toBe("medio");
    // Sem a pergunta de indicação, vale a nota baixa das outras.
    expect(humorDaAvaliacao({ comida: 2 })).toBe("ruim");
    expect(humorDaAvaliacao({ comida: 4 })).toBe("medio");
  });

  it("nomes de quem atende: sem espaço sobrando, sem repetir e com limite", () => {
    expect(normalizarAtendentes([" Ana  Paula ", "ana paula", "", "Bruno"])).toEqual({ ok: true, nomes: ["Ana Paula", "Bruno"] });
    expect(normalizarAtendentes(["x".repeat(41)])).toMatchObject({ ok: false });
    expect(normalizarAtendentes(Array.from({ length: 31 }, (_, i) => `Pessoa ${i}`))).toMatchObject({ ok: false });
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
