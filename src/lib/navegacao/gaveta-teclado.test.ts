import { describe, expect, it } from "vitest";
import { MARGEM_TOPO_GAVETA, posicaoGavetaAcimaDoTeclado } from "./gaveta-teclado";

describe("posicaoGavetaAcimaDoTeclado", () => {
  it("sem teclado: gaveta no rodapé com 85% da tela", () => {
    expect(posicaoGavetaAcimaDoTeclado({ alturaJanela: 664, alturaVisivel: 664, deslocamentoTopo: 0 })).toEqual({
      base: 0,
      altura: 564,
      tecladoAberto: false,
    });
  });

  it("teclado do iOS: sobe a gaveta acima dele e limita a altura ao que sobra visível", () => {
    const posicao = posicaoGavetaAcimaDoTeclado({ alturaJanela: 664, alturaVisivel: 365, deslocamentoTopo: 0 });
    expect(posicao).toEqual({ base: 299, altura: 365 - MARGEM_TOPO_GAVETA, tecladoAberto: true });
    // Topo da gaveta continua dentro da área visível.
    expect(664 - posicao.base - posicao.altura).toBe(MARGEM_TOPO_GAVETA);
  });

  it("área visível deslocada pelo navegador: desconta o deslocamento da base", () => {
    const posicao = posicaoGavetaAcimaDoTeclado({ alturaJanela: 664, alturaVisivel: 365, deslocamentoTopo: 100 });
    expect(posicao.base).toBe(199);
    expect(664 - posicao.base).toBe(100 + 365);
  });

  it("navegador que encolhe a página junto (Android): base zero e altura fixa", () => {
    expect(posicaoGavetaAcimaDoTeclado({ alturaJanela: 365, alturaVisivel: 365, deslocamentoTopo: 0 })).toEqual({
      base: 0,
      altura: 310,
      tecladoAberto: false,
    });
  });

  it("barra do navegador recolhendo não conta como teclado", () => {
    expect(posicaoGavetaAcimaDoTeclado({ alturaJanela: 700, alturaVisivel: 640, deslocamentoTopo: 0 }).tecladoAberto).toBe(
      false,
    );
  });

  it("nunca devolve valor negativo", () => {
    expect(posicaoGavetaAcimaDoTeclado({ alturaJanela: 300, alturaVisivel: 10, deslocamentoTopo: 400 })).toEqual({
      base: 0,
      altura: 0,
      tecladoAberto: false,
    });
  });
});
