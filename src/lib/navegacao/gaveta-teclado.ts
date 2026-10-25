// Gaveta do menu no celular (24/10/2026): com o teclado aberto, a folha fica
// "congelada" logo acima dele. No iOS o teclado não encolhe a página, só o
// viewport visual (`window.visualViewport`); ancorada no rodapé da página, a
// folha ia para trás do teclado e levava junto o campo "Filtrar menus".

/** Fração da altura da tela que a gaveta ocupa sem teclado (era o `max-h-[85dvh]`). */
export const FRACAO_ALTURA_GAVETA = 0.85;
/** Folga entre o topo da área visível e o topo da gaveta, para o fundo continuar tocável. */
export const MARGEM_TOPO_GAVETA = 24;
/** Abaixo disto a diferença é barra do navegador, não teclado. */
export const TECLADO_MINIMO = 120;

export type MedidasViewport = {
  /** `window.innerHeight`: altura do layout, que o teclado do iOS não muda. */
  alturaJanela: number;
  /** `visualViewport.height`: o que sobra visível acima do teclado. */
  alturaVisivel: number;
  /** `visualViewport.offsetTop`: quanto o navegador deslocou a área visível para baixo. */
  deslocamentoTopo: number;
};

export type PosicaoGaveta = {
  /** Distância do rodapé da página até a base da gaveta (altura do teclado), em px. */
  base: number;
  /** Altura fixa da gaveta, em px - não depende de quantos menus aparecem. */
  altura: number;
  tecladoAberto: boolean;
};

export function posicaoGavetaAcimaDoTeclado({
  alturaJanela,
  alturaVisivel,
  deslocamentoTopo,
}: MedidasViewport): PosicaoGaveta {
  const base = Math.max(0, Math.round(alturaJanela - alturaVisivel - deslocamentoTopo));
  const altura = Math.max(
    0,
    Math.round(Math.min(alturaJanela * FRACAO_ALTURA_GAVETA, alturaVisivel - MARGEM_TOPO_GAVETA)),
  );
  return { base, altura, tecladoAberto: base >= TECLADO_MINIMO };
}
