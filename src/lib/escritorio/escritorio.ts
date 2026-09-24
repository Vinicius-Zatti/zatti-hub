import { ESTADO, ESTADO_ATUALIZADO_EM } from "./estado";
import { POSICOES, SALAS } from "./estrutura";
import { ARQUETIPOS, OCUPANTES } from "./ocupantes";
import { RESPONSABILIDADES } from "./responsabilidades";
import type { Arquetipo, EstadoPosicao, Nivel, Ocupante, Posicao, Responsabilidade, Sala } from "./tipos";

export type PosicaoMontada = Posicao & {
  ocupante: Ocupante | null;
  arquetipo: Arquetipo | null;
  responsabilidade: Responsabilidade;
  estado: EstadoPosicao;
  reportaACargo: string | null;
};

export type IndicadoresSala = {
  total: number;
  preenchidas: number;
  vagas: number;
  /** 0 a 100. Média do nível das posições de IA preenchidas. `null` se não houver nenhuma. */
  maturidade: number | null;
  entregas: number;
  alertas: string[];
};

export type SalaMontada = Sala & { posicoes: PosicaoMontada[]; indicadores: IndicadoresSala };

export const PESO_NIVEL: Record<Nivel, number> = { definido: 1, processo: 2, operacional: 3 };

export function montarEscritorio(
  salas: Sala[] = SALAS,
  posicoes: Posicao[] = POSICOES,
): { salas: SalaMontada[]; atualizadoEm: string } {
  const porId = new Map(posicoes.map((p) => [p.id, p]));
  const montadas: PosicaoMontada[] = posicoes.map((p) => ({
    ...p,
    ocupante: p.ocupanteId ? OCUPANTES[p.ocupanteId] : null,
    arquetipo: p.arquetipoId ? ARQUETIPOS[p.arquetipoId] ?? null : null,
    responsabilidade: RESPONSABILIDADES[p.id],
    estado: ESTADO[p.id],
    reportaACargo: p.reportaA ? porId.get(p.reportaA)?.cargo ?? null : null,
  }));

  return {
    atualizadoEm: ESTADO_ATUALIZADO_EM,
    salas: salas.map((sala) => {
      const daSala = montadas.filter((p) => p.salaId === sala.id);
      return { ...sala, posicoes: daSala, indicadores: calcularIndicadores(daSala) };
    }),
  };
}

export function calcularIndicadores(posicoes: PosicaoMontada[]): IndicadoresSala {
  const vagas = posicoes.filter((p) => p.ocupanteId === null).length;
  // Posição de pessoa fica fora da maturidade: o objetivo é medir o quanto o
  // Time de IA já assume, não o quanto Vinícius ainda faz.
  const niveis = posicoes.map((p) => p.estado.nivel).filter((n): n is Nivel => n !== null);
  const maturidade = niveis.length
    ? Math.round((niveis.reduce((soma, n) => soma + PESO_NIVEL[n], 0) / (niveis.length * 3)) * 100)
    : null;

  const alertas = posicoes.flatMap((p) => [
    ...p.estado.alertas.map((a) => `${p.cargo}: ${a}`),
    ...(p.estado.situacao === "com-problema" ? [`${p.cargo}: ${p.estado.motivo ?? "com problema"}`] : []),
  ]);

  return {
    total: posicoes.length,
    preenchidas: posicoes.length - vagas,
    vagas,
    maturidade,
    entregas: posicoes.reduce((soma, p) => soma + p.estado.entregas.length, 0),
    alertas,
  };
}

/** Posições que dependem de Vinícius agora (aguardando ou com problema). */
export function precisamDeVoce(salas: SalaMontada[]): PosicaoMontada[] {
  return salas
    .flatMap((s) => s.posicoes)
    .filter((p) => p.estado.situacao === "aguardando-vinicius" || p.estado.situacao === "com-problema");
}

export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "Quem cuida de...": procura no cargo, nos assuntos e nas responsabilidades. */
export function buscarPorAssunto(salas: SalaMontada[], termo: string): PosicaoMontada[] {
  const busca = normalizar(termo);
  if (busca.length < 2) return [];
  return salas
    .flatMap((s) => s.posicoes)
    .filter((p) =>
      [p.cargo, ...p.responsabilidade.assuntos, ...p.responsabilidade.responsabilidades].some((t) =>
        normalizar(t).includes(busca),
      ),
    );
}
