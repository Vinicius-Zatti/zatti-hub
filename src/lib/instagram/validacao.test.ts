import { describe, expect, it } from "vitest";
import { automacaoInstagramSchema, lerRespostaInstagram, linkPostValido, palavraInstagramSchema } from "@/lib/instagram/validacao";

const automacao = (e: Record<string, unknown>) =>
  automacaoInstagramSchema.safeParse({ link: "https://www.instagram.com/reel/DfAbC123/", palavra: "cardapio", direct: "Oi! Segue o link.", linkEntrega: null, ...e });

describe("entrada das actions", () => {
  it("palavra: código do post e ativa booleana, nada mais", () => {
    expect(palavraInstagramSchema.safeParse({ codigo: "DfAbC123", ativa: false }).success).toBe(true);
    expect(palavraInstagramSchema.safeParse({ codigo: "Df/../x", ativa: false }).success).toBe(false);
    expect(palavraInstagramSchema.safeParse({ codigo: "DfAbC123", ativa: "nao" }).success).toBe(false);
    expect(palavraInstagramSchema.safeParse({ codigo: "DfAbC123", ativa: true, extra: 1 }).success).toBe(false);
  });

  it("automação segue os limites do contrato", () => {
    expect(automacao({}).success).toBe(true);
    expect(automacao({ palavra: "CardÁpio2" }).success).toBe(true);
    expect(automacao({ linkEntrega: "" }).data?.linkEntrega).toBeNull();
    expect(automacao({ linkEntrega: "https://zatti.com.br/x" }).success).toBe(true);
    expect(automacao({ palavra: "a" }).success).toBe(false);
    expect(automacao({ palavra: "duas palavras" }).success).toBe(false);
    expect(automacao({ palavra: "x".repeat(31) }).success).toBe(false);
    expect(automacao({ direct: "oi" }).success).toBe(false);
    expect(automacao({ direct: "x".repeat(901) }).success).toBe(false);
    expect(automacao({ linkEntrega: "http://zatti.com.br" }).success).toBe(false);
    expect(automacao({ link: "https://evil.com/reel/DfAbC123/" }).success).toBe(false);
  });

  it("link do post: só instagram.com, https, /p/ ou /reel/", () => {
    expect(linkPostValido("https://www.instagram.com/p/DfAbC123/")).toBe(true);
    expect(linkPostValido("https://instagram.com/reel/DfAbC123")).toBe(true);
    expect(linkPostValido("http://www.instagram.com/p/DfAbC123/")).toBe(false);
    expect(linkPostValido("https://www.instagram.com/viniciusczanetti/")).toBe(false);
    expect(linkPostValido("nada")).toBe(false);
  });
});

const contrato = {
  ok: true,
  automacao: {
    ligada: true,
    pausadaAte: null,
    enviosHoje: 12,
    tempoRespostaSeg: 95,
    registroDesde: "2026-11-06",
    palavras: [
      { codigo: "DfAbC123", link: "https://www.instagram.com/p/DfAbC123/", post: "cardápio", palavra: "cardapio", direct: "Oi", linkEntrega: null, envios: 40, ativa: true, origem: "hub" },
      { codigo: "ruim" },
    ],
    ultimos: [{ em: "2026-11-05T12:41:00Z", usuario: "@fulano", palavra: "cardapio", codigo: "DfAbC123" }],
  },
  metricas: {
    atualizadoEm: "2026-11-05T11:00:00Z",
    perfil: { seguidores: 1234, posts: 210 },
    periodos: {
      "7": { alcance: 1000, interacoes: 62, salvamentos: 10, seguidoresNovos: null, engajamento: 6.2, anterior: { alcance: 800, interacoes: 40, salvamentos: 5, seguidoresNovos: 3, engajamento: 5 } },
      "30": { alcance: null, interacoes: null, salvamentos: null, seguidoresNovos: null, engajamento: null, anterior: null },
    },
    alcance90Somado: true,
    porDia: [{ dia: "2026-11-04", alcance: 300 }, { dia: "2026-11-03", alcance: null }, { dia: "ontem" }],
    voce: { postsPorSemana: 5, viewsPorPost: null, interacoesPorPost: 40 },
    formatos: [{ formato: "Reels", posts: 4, viewsPorPost: 900, salvamentosPorPost: 3 }],
  },
  concorrencia: { lidoEm: null, perfis: [{ perfil: "donosderestaurantes", postsPorSemana: 7, viewsPorPost: null, interacoesPorPost: 20 }] },
};

describe("leitura do Vini", () => {
  it("lê o contrato, mantém null como null e conta o que ficou de fora", () => {
    const r = lerRespostaInstagram(contrato);
    expect(r).not.toBeNull();
    expect(r!.automacao.palavras).toHaveLength(1);
    expect(r!.automacao.palavras[0]).toMatchObject({ palavra: "cardapio", envios: 40, origem: "hub", linkEntrega: null });
    expect(r!.automacao.ultimos[0].usuario).toBe("fulano");
    expect(r!.automacao.registroDesde).toBe("2026-11-06");
    expect(r!.metricas.periodos["7"]?.seguidoresNovos).toBeNull();
    expect(r!.metricas.periodos["7"]?.anterior?.alcance).toBe(800);
    expect(r!.metricas.periodos["30"]?.alcance).toBeNull();
    expect(r!.metricas.periodos["90"]).toBeNull();
    expect(r!.metricas.porDia.map((d) => d.dia)).toEqual(["2026-11-03", "2026-11-04"]);
    expect(r!.metricas.voce.viewsPorPost).toBeNull();
    expect(r!.concorrencia.lidoEm).toBeNull();
    expect(r!.ignorados).toBe(2);
  });

  it("envelope fora do contrato vira null", () => {
    expect(lerRespostaInstagram(null)).toBeNull();
    expect(lerRespostaInstagram({ ok: false, erro: "x" })).toBeNull();
    expect(lerRespostaInstagram({ ok: true })).toBeNull();
  });

  it("sem métricas nem concorrência, a tela ainda abre", () => {
    const r = lerRespostaInstagram({ ok: true, automacao: { ligada: false } });
    expect(r!.automacao).toMatchObject({ ligada: false, enviosHoje: null, tempoRespostaSeg: null, palavras: [] });
    expect(r!.metricas.porDia).toEqual([]);
    expect(r!.concorrencia.perfis).toEqual([]);
  });
});
