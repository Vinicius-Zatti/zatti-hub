// Posição do balão do "i" de cálculo (`DicaCalculo`), em coordenadas da tela
// (position: fixed). Função pura para ser testada sem navegador.

type Retangulo = { top: number; bottom: number; left: number };
type Tamanho = { largura: number; altura: number };

/** Margem mínima entre o balão e a borda da tela. */
export const MARGEM_BALAO = 8;
const DISTANCIA = 6;

/** Abaixo do "i", alinhado à esquerda dele; nunca passa da lateral da tela
 * (em 375px o balão de 288px fica inteiro dentro) e vira para cima quando não
 * cabe embaixo e cabe em cima. */
export function posicionarBalao(botao: Retangulo, balao: Tamanho, tela: Tamanho): { top: number; left: number } {
  const largura = Math.min(balao.largura, tela.largura - 2 * MARGEM_BALAO);
  const left = Math.max(MARGEM_BALAO, Math.min(botao.left - MARGEM_BALAO, tela.largura - largura - MARGEM_BALAO));
  const abaixo = botao.bottom + DISTANCIA;
  const acima = botao.top - DISTANCIA - balao.altura;
  const naoCabeEmbaixo = abaixo + balao.altura > tela.altura - MARGEM_BALAO;
  const top = naoCabeEmbaixo && acima >= MARGEM_BALAO ? acima : abaixo;
  return { top, left };
}
