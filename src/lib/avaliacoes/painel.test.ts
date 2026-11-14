import { describe, expect, it } from "vitest";
import {
  calcularNps,
  contatosComConsentimento,
  dataHoraBr,
  filtrarPorOrigem,
  formatarWhatsapp,
  gerarCsv,
  intervaloPeriodo,
  lerFiltroOrigem,
  lerPeriodo,
  media,
  resumir,
  resumirLivres,
  type RespostaPainel,
} from "./painel";

function resposta(p: Partial<RespostaPainel>): RespostaPainel {
  return {
    id: p.id ?? "r1",
    criadoEm: "2026-11-12T23:14:00.000Z",
    origem: "salao",
    atendimento: null,
    comida: null,
    tempo: null,
    ambiente: null,
    embalagem: null,
    entrega: null,
    atendimentoPedido: null,
    pedidoCerto: null,
    atendente: null,
    espera: null,
    nps: null,
    conheceu: null,
    conheceuOutro: null,
    comentario: null,
    extras: null,
    notaBaixa: false,
    whatsapp: null,
    consentimentoEm: null,
    consentimentoVersao: null,
    ...p,
  };
}

describe("NPS e médias", () => {
  it("NPS = % de 9 e 10 menos % de 0 a 6, arredondado", () => {
    expect(calcularNps([10, 9, 8, 7, 6, 0])).toEqual({ nps: 0, promotores: 2, neutros: 2, detratores: 2, total: 6 });
    expect(calcularNps([10, 10, 10, 6]).nps).toBe(50);
    expect(calcularNps([3, 4]).nps).toBe(-100);
    expect(calcularNps([]).nps).toBeNull();
  });

  it("média com uma casa; sem nota, nulo", () => {
    expect(media([5, 4, 4])).toBe(4.3);
    expect(media([])).toBeNull();
  });

  it("resumo conta só quem respondeu cada pergunta e separa por origem", () => {
    const r = resumir([
      resposta({ id: "a", atendimento: 5, comida: 4, nps: 10, espera: "ate_15", conheceu: "instagram" }),
      resposta({ id: "b", origem: "delivery", atendimento: 2, nps: 5, espera: "mais_de_45", notaBaixa: true, conheceu: "outro", conheceuOutro: "Rádio" }),
      resposta({ id: "c", comida: 2, notaBaixa: true }),
    ]);
    expect(r.total).toBe(3);
    expect(r.porOrigem).toEqual({ salao: 2, delivery: 1, app: 0 });
    expect(r.medias.find((m) => m.chave === "atendimento")).toMatchObject({ media: 3.5, respostas: 2 });
    expect(r.medias.find((m) => m.chave === "comida")).toMatchObject({ media: 3, respostas: 2 });
    // Pergunta sem nenhuma nota não vira cartão (só atendimento e comida aparecem sempre).
    expect(r.medias.map((m) => m.chave)).toEqual(["atendimento", "comida"]);
    expect(r.nps.nps).toBe(0);
    expect(r.notasBaixas).toBe(2);
    expect(r.espera.find((e) => e.valor === "ate_15")).toMatchObject({ quantidade: 1, percentual: 50 });
    expect(r.conheceu.find((e) => e.valor === "outro")).toMatchObject({ quantidade: 1, percentual: 50 });
    expect(r.conheceuOutros).toEqual(["Rádio"]);
  });

  it("perguntas novas (13/11/2026): médias por pergunta, pedido certo e quem atendeu", () => {
    const r = resumir([
      resposta({ id: "a", atendimento: 5, tempo: 4, ambiente: 5, atendente: "Bruno", nps: 10 }),
      resposta({ id: "b", atendimento: 3, tempo: 2, atendente: "Bruno", nps: 6, notaBaixa: true }),
      resposta({ id: "c", atendente: "nao_lembro", atendimento: 4 }),
      resposta({ id: "d", origem: "app", pedidoCerto: false, embalagem: 2, comida: 3, notaBaixa: true }),
      resposta({ id: "e", origem: "app", pedidoCerto: true, embalagem: 5, comida: 5 }),
    ]);
    expect(r.medias.find((m) => m.chave === "tempo")).toMatchObject({ media: 3, respostas: 2 });
    expect(r.medias.find((m) => m.chave === "embalagem")).toMatchObject({ media: 3.5, respostas: 2 });
    expect(r.medias.some((m) => m.chave === "entrega")).toBe(false);
    expect(r.pedidoCerto).toEqual({ certos: 1, total: 2 });
    expect(r.atendentes).toEqual([
      { nome: "Bruno", quantidade: 2, mediaAtendimento: 4, mediaIndicaria: 8 },
      { nome: "Não lembra o nome", quantidade: 1, mediaAtendimento: 4, mediaIndicaria: null },
    ]);
  });

  it("filtro de origem", () => {
    const lista = [resposta({ id: "a" }), resposta({ id: "b", origem: "delivery" })];
    expect(filtrarPorOrigem(lista, "delivery").map((r) => r.id)).toEqual(["b"]);
    expect(filtrarPorOrigem(lista, "todas")).toHaveLength(2);
  });
});

describe("filtros e datas", () => {
  it("período e origem desconhecidos caem no padrão", () => {
    expect(lerPeriodo("7")).toBe("7");
    expect(lerPeriodo("365")).toBe("30");
    expect(lerFiltroOrigem("delivery")).toBe("delivery");
    expect(lerFiltroOrigem("x")).toBe("todas");
  });

  it("período começa à meia-noite de Brasília", () => {
    const i = intervaloPeriodo("7", new Date("2026-11-12T15:00:00.000Z"));
    expect(i).toEqual({ de: "2026-11-06", ate: "2026-11-12", desdeIso: "2026-11-06T03:00:00.000Z" });
  });

  it("data e hora no fuso de Brasília", () => {
    expect(dataHoraBr("2026-11-13T01:30:00.000Z")).toBe("12/11/2026 22:30");
  });
});

describe("contatos e CSV", () => {
  it("contato só com WhatsApp e autorização", () => {
    const lista = [
      resposta({ id: "a", whatsapp: "5516999990001", consentimentoEm: "2026-11-12T23:14:00.000Z", consentimentoVersao: 1 }),
      resposta({ id: "b" }),
    ];
    expect(contatosComConsentimento(lista).map((r) => r.id)).toEqual(["a"]);
    expect(formatarWhatsapp("5516999990001")).toBe("(16) 99999-0001");
    expect(formatarWhatsapp("551633334444")).toBe("(16) 3333-4444");
  });

  it("CSV com ; e BOM, comentário com fórmula vira texto", () => {
    const csv = gerarCsv([
      resposta({
        atendimento: 5,
        comida: 4,
        nps: 9,
        espera: "ate_15",
        conheceu: "instagram",
        comentario: "=HYPERLINK(\"x\")",
        whatsapp: "5516999990001",
        consentimentoEm: "2026-11-12T23:14:00.000Z",
      }),
    ]);
    expect(csv.startsWith("﻿Data e hora;Origem;")).toBe(true);
    const linha = csv.split("\r\n")[1];
    expect(linha).toContain("12/11/2026 20:14;Salão;5;4;;;;;;;;Até 15 min;9;Instagram;;");
    expect(linha).toContain(`"'=HYPERLINK(""x"")"`);
    expect(linha).toContain("(16) 99999-0001");
  });
});

describe("perguntas da gestão no painel (14/11/2026)", () => {
  const livres = [
    { chave: "extra_preco1" as const, texto: "E o preço?", ativa: true, origens: ["salao" as const], tipo: "estrelas" as const, obrigatoria: true },
    { chave: "extra_burg01" as const, texto: "Qual burger?", ativa: true, origens: ["app" as const], tipo: "escolha" as const, obrigatoria: false, opcoes: ["Smash", "Duplo"] },
    { chave: "extra_volta1" as const, texto: "Voltaria?", ativa: false, origens: ["app" as const], tipo: "simnao" as const, obrigatoria: false },
  ];
  const respostas = [
    resposta({ id: "a", extras: { extra_preco1: 4, extra_burg01: "Smash" } }),
    resposta({ id: "b", extras: { extra_preco1: 2, extra_burg01: "Smash" } }),
    resposta({ id: "c", extras: null }),
  ];

  it("média das estrelas, contagem das opções e some quem não teve resposta nem está ligada", () => {
    const r = resumirLivres(respostas, livres, ["extra_preco1", "extra_burg01"]);
    expect(r.map((x) => x.chave)).toEqual(["extra_preco1", "extra_burg01"]);
    expect(r[0]).toMatchObject({ respostas: 2, media: 3 });
    expect(r[1].opcoes.map((o) => o.quantidade)).toEqual([2, 0]);
  });

  it("CSV ganha uma coluna por pergunta da gestão", () => {
    const csv = gerarCsv([respostas[0]], livres);
    expect(csv).toContain("E o preço?");
    expect(csv).toContain(";4;Smash;");
  });
});
