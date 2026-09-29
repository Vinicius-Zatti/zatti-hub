// Orçamento de tempo de uma leitura (revisão final do Codex, 29/09): a
// função do servidor tem limite fixo (maxDuration da página), então toda
// etapa lenta (abrir o PDF, ler as páginas, chamar a IA, classificar) usa o
// que sobra deste prazo e é cancelada de fato quando ele acaba, sempre
// deixando uma reserva para gravar o resultado e o custo da IA.

/** Tempo total que a leitura pode usar; a página declara 120 s de duração. */
export const PRAZO_LEITURA_MS = 95_000;
/** Reserva para gravar resultado, finalizar o registro de IA e responder. */
export const RESERVA_PERSISTENCIA_MS = 15_000;
/** Abaixo disto não vale começar uma chamada de IA. */
export const MINIMO_CHAMADA_IA_MS = 20_000;

export type Prazo = {
  /** Milissegundos ainda utilizáveis, já descontada a reserva. */
  restante: () => number;
  /** Sinal que aborta quando o prazo utilizável acaba. */
  sinal: AbortSignal;
};

export function criarPrazo(totalMs: number = PRAZO_LEITURA_MS, agora: () => number = Date.now): Prazo {
  const limite = agora() + totalMs - RESERVA_PERSISTENCIA_MS;
  const controle = new AbortController();
  const espera = Math.max(0, limite - agora());
  const timer = setTimeout(() => controle.abort(), espera);
  // Não segura o processo vivo só por causa do timer.
  (timer as { unref?: () => void }).unref?.();
  return { restante: () => Math.max(0, limite - agora()), sinal: controle.signal };
}

/** Corre `tarefa` até `ms` ou até o sinal abortar; `null` se estourou. */
export async function comLimite<T>(tarefa: Promise<T>, ms: number, sinal?: AbortSignal): Promise<T | null> {
  if (ms <= 0 || sinal?.aborted) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let aoAbortar: (() => void) | undefined;
  const estouro = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
    aoAbortar = () => resolve(null);
    sinal?.addEventListener("abort", aoAbortar, { once: true });
  });
  try {
    return await Promise.race([tarefa, estouro]);
  } finally {
    if (timer) clearTimeout(timer);
    if (aoAbortar) sinal?.removeEventListener("abort", aoAbortar);
  }
}
