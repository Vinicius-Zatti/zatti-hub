"use client";

import { useCallback, useEffect } from "react";
import { sincronizarCotacaoAction } from "@/app/(app)/estoque/pedidos/cotacoes/actions";
import { criarSincronizadorCotacao } from "@/lib/sincronizacao-cotacao";

/** Um só por aba, fora de qualquer componente: a pendência sobrevive à
 * desmontagem do editor (trocar de contagem, ir para outra tela). Ver
 * `lib/sincronizacao-cotacao.ts`. */
export const sincronizadorCotacao = criarSincronizadorCotacao({
  sincronizar: () => sincronizarCotacaoAction(),
  agendar: (fn, ms) => setTimeout(fn, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
});

/** Confirmar na Criar Cotação e no Editor de Espelhos não revalida mais a cada
 * clique (fase 3 de velocidade, 23/10/2026). Sem nenhuma revalidação, o
 * voltar/avançar do navegador remontava a tela como ela era antes das
 * confirmações. `agendar` marca a pendência e sincroniza depois de uma pausa
 * nos cliques: um recálculo por pausa, em vez de um por clique. Navegação que
 * precisa dos dados atuais espera `sincronizarAgora`. Sair da tela adianta a
 * tentativa; a pendência continua no `sincronizadorCotacao` até dar certo. */
export function useSincronizarCotacao(): { agendar: () => void; sincronizarAgora: () => Promise<void> } {
  useEffect(() => {
    return () => {
      if (sincronizadorCotacao.temPendencia()) void sincronizadorCotacao.sincronizarAgora();
    };
  }, []);
  const agendar = useCallback(() => sincronizadorCotacao.marcarPendente(), []);
  const sincronizarAgora = useCallback(() => sincronizadorCotacao.sincronizarAgora(), []);
  return { agendar, sincronizarAgora };
}

/** Montado uma vez no layout do app (não desmonta entre telas): retoma a
 * pendência quando a conexão volta, quando a aba volta a aparecer (ou vai ser
 * escondida, última chance antes de o navegador congelar os timers) e quando a
 * página volta do cache do voltar/avançar. Não desenha nada. */
export function SincronizadorCotacao(): null {
  useEffect(() => {
    const retomar = () => sincronizadorCotacao.retomar();
    window.addEventListener("online", retomar);
    window.addEventListener("pageshow", retomar);
    document.addEventListener("visibilitychange", retomar);
    return () => {
      window.removeEventListener("online", retomar);
      window.removeEventListener("pageshow", retomar);
      document.removeEventListener("visibilitychange", retomar);
    };
  }, []);
  return null;
}
