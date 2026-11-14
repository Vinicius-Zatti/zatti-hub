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
  alternarNaOrigem,
  ehChaveLivre,
  moverNaOrigem,
  novaChaveLivre,
  origensDaPergunta,
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

describe("perguntas da gestão e pergunta por tipo (14/11/2026)", () => {
  const preco = { chave: "extra_preco1", texto: "E o preço?", ativa: true, origens: ["salao", "app"], tipo: "estrelas", obrigatoria: true } as const;
  const burger = { chave: "extra_burg01", texto: "Qual foi o seu burger?", ativa: true, origens: ["app"], tipo: "escolha", obrigatoria: false, opcoes: ["Smash", "Duplo"] } as const;
  const comLivres = () => [...perguntasPadrao().slice(0, 3), { ...preco, origens: [...preco.origens] }, { ...burger, origens: [...burger.origens], opcoes: [...burger.opcoes] }, ...perguntasPadrao().slice(3)];

  it("valida a pergunta da gestão: tipo, opções, pesquisas e limite de 10", () => {
    expect(validarPerguntas(comLivres()).ok).toBe(true);
    const semOnde = comLivres().map((p) => (p.chave === "extra_preco1" ? { ...p, origens: [] } : p));
    expect(validarPerguntas(semOnde)).toMatchObject({ ok: false });
    const umaOpcao = comLivres().map((p) => (p.chave === "extra_burg01" ? { ...p, opcoes: ["Smash"] } : p));
    expect(validarPerguntas(umaOpcao)).toMatchObject({ ok: false });
    const repetida = comLivres().map((p) => (p.chave === "extra_burg01" ? { ...p, opcoes: ["Smash", "smash"] } : p));
    expect(validarPerguntas(repetida)).toMatchObject({ ok: false });
    const onze = [...perguntasPadrao(), ...Array.from({ length: 11 }, (_, i) => ({ ...preco, chave: `extra_x0000${i.toString(36)}`, origens: ["salao"] }))];
    expect(validarPerguntas(onze).ok).toBe(false);
    // Pergunta do modelo não pode ir para pesquisa em que não faz sentido.
    const atendimentoNoApp = perguntasPadrao().map((p) => (p.chave === "atendimento" ? { ...p, origens: ["app"] } : p));
    expect(validarPerguntas(atendimentoNoApp).ok).toBe(false);
  });

  it("a ordem gravada vale na página e a pergunta da gestão aparece só onde foi marcada", () => {
    const lidas = lerPerguntas(comLivres());
    const salao = perguntasDoTipo(lidas, "salao").map((p) => p.chave);
    expect(salao.slice(0, 3)).toEqual(["atendimento", "comida", "extra_preco1"]);
    expect(perguntasDoTipo(lidas, "app").map((p) => p.chave)).toContain("extra_burg01");
    expect(perguntasDoTipo(lidas, "delivery").map((p) => p.chave)).not.toContain("extra_preco1");
    const b = perguntasDoTipo(lidas, "app").find((p) => p.chave === "extra_burg01");
    expect(b).toMatchObject({ tipo: "escolha", obrigatoria: false, livre: true, opcoes: [{ valor: "Smash", rotulo: "Smash" }, { valor: "Duplo", rotulo: "Duplo" }] });
  });

  it("desligar num tipo não mexe nos outros; ligar de novo em todos volta ao padrão", () => {
    const comida = perguntasPadrao().find((p) => p.chave === "comida")!;
    const semApp = alternarNaOrigem(comida, "app", false);
    expect(origensDaPergunta(semApp)).toEqual(["salao", "delivery"]);
    expect(alternarNaOrigem(semApp, "app", true)).toEqual({ chave: "comida", texto: comida.texto, ativa: true });
    const nenhuma = alternarNaOrigem(alternarNaOrigem(semApp, "salao", false), "delivery", false);
    expect(nenhuma.ativa).toBe(false);
    expect(origensDaPergunta(alternarNaOrigem(nenhuma, "delivery", true))).toEqual(["delivery"]);
  });

  it("subir e descer troca com a vizinha da mesma pesquisa", () => {
    const lista = perguntasPadrao();
    const movida = moverNaOrigem(lista, "comida", "salao", "subir");
    expect(perguntasDoTipo(movida, "salao").map((p) => p.chave).slice(0, 2)).toEqual(["comida", "atendimento"]);
    // No delivery a ordem relativa não muda (atendimento não aparece lá).
    expect(perguntasDoTipo(movida, "delivery").map((p) => p.chave)).toEqual(perguntasDoTipo(lista, "delivery").map((p) => p.chave));
    expect(moverNaOrigem(lista, "atendimento", "salao", "subir")).toBe(lista);
  });

  it("respostas: escolha só da lista, estrela baixa da gestão vira nota baixa", () => {
    const app = perguntasDoTipo(lerPerguntas(comLivres()), "app");
    const base = { pedido_certo: "sim", comida: "5", embalagem: "5", nps: "10", extra_preco1: "4" };
    expect(validarRespostas(app, { ...base, extra_burg01: "Smash" })).toMatchObject({ ok: true, respostas: { extra_preco1: 4, extra_burg01: "Smash" } });
    expect(validarRespostas(app, { ...base, extra_burg01: "Frango" })).toMatchObject({ ok: false, chave: "extra_burg01" });
    expect(validarRespostas(app, { ...base, extra_preco1: "" })).toMatchObject({ ok: false, chave: "extra_preco1" });
    expect(ehNotaBaixa({ nps: 10, extra_preco1: 2 })).toBe(true);
    expect(ehNotaBaixa({ nps: 10, extra_preco1: 3 })).toBe(false);
  });

  it("chave nova não repete", () => {
    const sempreZero = () => 0;
    expect(novaChaveLivre([], sempreZero)).toBe("extra_aaaaaa");
    expect(ehChaveLivre(novaChaveLivre(["extra_aaaaaa"]))).toBe(true);
  });
});
