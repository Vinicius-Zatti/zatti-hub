import { describe, expect, it } from "vitest";
import { agruparVideosPorSecao, ehVideoDeitado, secaoDoVideo } from "./central";
import { VIDEOS_AJUDA } from "./regras";

describe("central de vídeos explicativos", () => {
  it("agrupa os vídeos atuais em Começo, Estoque e Garante, na ordem de VIDEOS_AJUDA", () => {
    const grupos = agruparVideosPorSecao(VIDEOS_AJUDA);
    expect(grupos.map((g) => g.secao)).toEqual(["Começo", "Estoque", "Garante"]);
    expect(grupos[0].videos.map((v) => v.id)).toEqual(["boas-vindas", "instalar-iphone", "instalar-android", "inicio", "dashboard"]);
    expect(grupos[1].videos.map((v) => v.id)).toContain("contagem");
    // Os 10 vídeos das telas do Estoque (27/10/2026) também entram em Estoque.
    expect(grupos[1].videos).toHaveLength(14);
    expect(grupos[1].videos.map((v) => v.id)).toContain("estoque-cmv-real");
    // Os 5 do Checklist Garante (27/10/2026) ganham seção própria.
    expect(grupos[2].videos.map((v) => v.id)).toEqual(["garante-hoje", "garante-planos", "garante-quadro", "garante-nota", "garante-modelos"]);
  });

  it("vídeo novo entra sozinho: id conhecido vai para a seção dele, desconhecido para Outros vídeos", () => {
    const grupos = agruparVideosPorSecao({ espelhos: 1, "boas-vindas": 2, cotacao: 3, novidade: 4 });
    expect(grupos).toEqual([
      { secao: "Começo", videos: [{ id: "boas-vindas", video: 2 }] },
      { secao: "Estoque", videos: [{ id: "espelhos", video: 1 }, { id: "cotacao", video: 3 }] },
      { secao: "Outros vídeos", videos: [{ id: "novidade", video: 4 }] },
    ]);
    expect(secaoDoVideo("pedido-feito")).toBe("Estoque");
    expect(secaoDoVideo("garante-nota")).toBe("Garante");
  });

  it("selo de celular deitado só para capa mais larga que alta", () => {
    expect(ehVideoDeitado(1664, 768)).toBe(true);
    expect(ehVideoDeitado(384, 832)).toBe(false);
    expect(ehVideoDeitado(500, 500)).toBe(false);
    expect(ehVideoDeitado(0, 0)).toBe(false);
  });
});
