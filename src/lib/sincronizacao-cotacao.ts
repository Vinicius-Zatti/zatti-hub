/** Pendência de sincronização da cotação (Criar Cotação e Editor de Espelhos).
 *
 * Confirmar não revalida mais a cada clique (fase 3 de velocidade,
 * 23/10/2026): uma sincronização roda depois de uma pausa nos cliques. Parecer
 * do Codex (24/10/2026): a pendência não pode morar no editor (desmontar
 * zerava tudo) nem desistir depois de 3 tentativas. Aqui ela fica num objeto
 * único da aba, que sobrevive à troca de tela, e só sai depois de uma
 * sincronização que deu certo. Falha tenta de novo com espera crescente, sem
 * limite de tentativas; sem conexão espera a conexão voltar. `retomar` (chamado
 * pelo `SincronizadorCotacao`, montado no layout do app) tenta na hora quando a
 * conexão ou a aba voltam.
 *
 * Recarregar a página não precisa de pendência: a tela nova já vem do banco.
 *
 * Sem dependência de navegador nem de Server Action: tudo entra por
 * parâmetro, para o teste controlar relógio, rede e resultado. */

export type DependenciasSincronizacao = {
  sincronizar: () => Promise<void>;
  agendar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
  /** false quando o navegador sabe que está sem rede. */
  online: () => boolean;
  /** Pausa nos cliques antes de sincronizar. */
  esperaMs?: number;
  /** Primeira espera depois de uma falha; dobra a cada falha seguida. */
  esperaFalhaMs?: number;
  /** Teto da espera entre tentativas. */
  esperaFalhaMaxMs?: number;
};

export type SincronizadorCotacao = {
  /** Uma confirmação foi gravada: fica pendente e sincroniza depois da pausa. */
  marcarPendente: () => void;
  /** Sincroniza já (uma tentativa). Se falhar, a pendência continua e uma nova
   * tentativa fica agendada. */
  sincronizarAgora: () => Promise<void>;
  /** Conexão ou aba voltaram: tenta na hora se houver pendência. */
  retomar: () => void;
  temPendencia: () => boolean;
};

export function criarSincronizadorCotacao(dep: DependenciasSincronizacao): SincronizadorCotacao {
  const esperaMs = dep.esperaMs ?? 2500;
  const esperaFalhaMs = dep.esperaFalhaMs ?? 5000;
  const esperaFalhaMaxMs = dep.esperaFalhaMaxMs ?? 60000;

  // Pendência por geração: confirmação feita durante uma requisição em voo
  // continua pendente depois dela.
  let geracao = 0;
  let sincronizada = 0;
  let falhasSeguidas = 0;
  let timer: unknown = null;
  let emVoo: Promise<void> | null = null;

  const temPendencia = () => geracao > sincronizada;

  function limparTimer() {
    if (timer !== null) dep.cancelar(timer);
    timer = null;
  }

  function agendarEm(ms: number) {
    limparTimer();
    timer = dep.agendar(() => {
      timer = null;
      void sincronizarAgora();
    }, ms);
  }

  function agendarNovaTentativa() {
    // Sem rede não adianta contar tempo: o evento `online` chama `retomar`.
    if (!dep.online()) {
      limparTimer();
      return;
    }
    const espera = Math.min(esperaFalhaMs * 2 ** Math.max(0, falhasSeguidas - 1), esperaFalhaMaxMs);
    agendarEm(espera);
  }

  async function sincronizarAgora(): Promise<void> {
    limparTimer();
    // Uma requisição por vez: quem chega no meio espera a que está em voo e só
    // abre outra se ainda sobrar confirmação pendente.
    while (emVoo) await emVoo;
    if (!temPendencia()) return;
    const alvo = geracao;
    const rodada = (async () => {
      try {
        await dep.sincronizar();
        sincronizada = Math.max(sincronizada, alvo);
        falhasSeguidas = 0;
      } catch {
        falhasSeguidas += 1;
        agendarNovaTentativa();
      }
    })();
    emVoo = rodada;
    try {
      await rodada;
    } finally {
      emVoo = null;
    }
  }

  return {
    marcarPendente() {
      geracao += 1;
      // Depois de uma falha, a nova confirmação não encurta a espera crescente
      // (não martela o servidor que acabou de falhar); sem falha, é a pausa.
      if (falhasSeguidas > 0 && timer !== null) return;
      agendarEm(esperaMs);
    },
    sincronizarAgora,
    retomar() {
      if (temPendencia() && dep.online()) void sincronizarAgora();
    },
    temPendencia,
  };
}
