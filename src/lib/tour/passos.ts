import { MODULO_TOUR_POR_ROTULO, ROTEIROS_TOUR, type ModuloTour, type PassoTour } from "./roteiros";

// Lógica pura do tour do primeiro acesso (Navegação V2, fase 4, 25/10/2026):
// quando mostrar, quais passos valem na tela e onde o balão fica. Sem DOM aqui,
// para testar no vitest; o componente (`navegacao-v2/tour-modulo.tsx`) só mede
// a tela e chama estas funções.
//
// Lição do benchmark XMenu: lá o tour reaparece a cada sessão e irrita. Aqui
// ele aparece UMA vez por usuário por módulo e fica salvo em `tours_vistos`.

export const MODULOS_TOUR = Object.keys(ROTEIROS_TOUR) as ModuloTour[];

export function ehModuloTour(valor: unknown): valor is ModuloTour {
  return typeof valor === "string" && (MODULOS_TOUR as string[]).includes(valor);
}

/** Chave do tour pelo rótulo do módulo ativo no menu; null = módulo sem tour. */
export function moduloTourDoRotulo(rotulo: string | undefined): ModuloTour | null {
  if (!rotulo) return null;
  return MODULO_TOUR_POR_ROTULO[rotulo] ?? null;
}

/**
 * Mostra sozinho só na primeira vez. `vistos === null` quer dizer que a
 * leitura do banco falhou (ex.: migration ainda não aplicada): na dúvida não
 * mostra, para não reaparecer a cada tela.
 */
export function deveMostrarTour(modulo: ModuloTour | null, vistos: ReadonlySet<string> | null): boolean {
  if (!modulo || vistos === null) return false;
  return !vistos.has(modulo);
}

/** Passos com o alvo presente na tela agora; os sem alvo são pulados. */
export function passosVisiveis(
  passos: readonly PassoTour[],
  alvoVisivel: (seletores: readonly string[]) => boolean,
): PassoTour[] {
  return passos.filter((passo) => alvoVisivel(passo.alvos));
}

/** Contador do balão: "2 de 4". */
export function textoContador(indice: number, total: number): string {
  return `${indice + 1} de ${total}`;
}

export function ehUltimoPasso(indice: number, total: number): boolean {
  return indice >= total - 1;
}

type Retangulo = { top: number; bottom: number; left: number; right: number };
type Tamanho = { largura: number; altura: number };
export type TelaTour = {
  largura: number;
  altura: number;
  /** Altura ocupada embaixo que o balão não pode cobrir (barra de atalhos do celular). */
  reservaInferior: number;
};

export const MARGEM_TOUR = 12;
const DISTANCIA_TOUR = 12;

export type PosicaoBalaoTour = { top: number; left: number; lado: "abaixo" | "acima" };

/**
 * Balão ancorado no alvo: embaixo dele quando cabe, senão em cima; nunca sai
 * pela lateral nem cobre a barra de baixo. Alvo maior que a tela (lista
 * longa): o balão fica preso dentro da faixa livre, por cima do alvo.
 */
export function posicionarBalaoTour(alvo: Retangulo, balao: Tamanho, tela: TelaTour): PosicaoBalaoTour {
  const largura = Math.min(balao.largura, tela.largura - 2 * MARGEM_TOUR);
  const centro = (alvo.left + alvo.right) / 2;
  const left = Math.round(
    Math.max(MARGEM_TOUR, Math.min(centro - largura / 2, tela.largura - largura - MARGEM_TOUR)),
  );

  const limiteInferior = tela.altura - tela.reservaInferior - MARGEM_TOUR;
  const abaixo = alvo.bottom + DISTANCIA_TOUR;
  const acima = alvo.top - DISTANCIA_TOUR - balao.altura;
  if (abaixo + balao.altura <= limiteInferior) return { top: Math.round(abaixo), left, lado: "abaixo" };
  if (acima >= MARGEM_TOUR) return { top: Math.round(acima), left, lado: "acima" };
  // Não cabe nem embaixo nem em cima: o mais baixo possível dentro da faixa livre.
  const top = Math.max(MARGEM_TOUR, limiteInferior - balao.altura);
  return { top: Math.round(top), left, lado: "abaixo" };
}
