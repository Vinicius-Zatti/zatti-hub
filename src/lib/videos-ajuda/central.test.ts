import { describe, expect, it } from "vitest";
import { agruparVideosPorSecao, ehVideoDeitado, secaoDoVideo } from "./central";
import { VIDEOS_AJUDA } from "./regras";

describe("central de vídeos explicativos", () => {
  it("agrupa os vídeos atuais em Começo e Estoque, na ordem de VIDEOS_AJUDA", () => {
    const grupos = agruparVideosPorSecao(VIDEOS_AJUDA);
    expect(grupos.map((g) => g.secao)).toEqual(["Começo", "Estoque"]);
    expect(grupos[0].videos.map((v) => v.id)).toEqual(["boas-vindas", "instalar-iphone", "instalar-android"]);
    expect(grupos[1].videos.map((v) => v.id)).toContain("contagem");
  });

  it("vídeo novo entra sozinho: id conhecido vai para a seção dele, desconhecido para Outros vídeos", () => {
    const grupos = agruparVideosPorSecao({ espelhos: 1, "boas-vindas": 2, cotacao: 3, novidade: 4 });
    expect(grupos).toEqual([
      { secao: "Começo", videos: [{ id: "boas-vindas", video: 2 }] },
      { secao: "Estoque", videos: [{ id: "espelhos", video: 1 }, { id: "cotacao", video: 3 }] },
      { secao: "Outros vídeos", videos: [{ id: "novidade", video: 4 }] },
    ]);
    expect(secaoDoVideo("pedido-feito")).toBe("Estoque");
  });

  it("selo de celular deitado só para capa mais larga que alta", () => {
    expect(ehVideoDeitado(1664, 768)).toBe(true);
    expect(ehVideoDeitado(384, 832)).toBe(false);
    expect(ehVideoDeitado(500, 500)).toBe(false);
    expect(ehVideoDeitado(0, 0)).toBe(false);
  });
});
