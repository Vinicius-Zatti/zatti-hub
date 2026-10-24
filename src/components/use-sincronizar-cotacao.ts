"use client";

import { useCallback, useEffect, useRef } from "react";
import { sincronizarCotacaoAction } from "@/app/(app)/estoque/pedidos/cotacoes/actions";

const ESPERA_MS = 2500;
const ESPERA_NOVA_TENTATIVA_MS = 5000;
const MAX_TENTATIVAS = 3;

/** Confirmar na Criar Cotação e no Editor de Espelhos não revalida mais a cada
 * clique (fase 3 de velocidade, 23/10/2026). Sem nenhuma revalidação, o
 * voltar/avançar do navegador remontava a tela como ela era antes das
 * confirmações. Este hook agenda uma sincronização depois de uma pausa nos
 * cliques: um recálculo por pausa, em vez de um por clique. O estado digitado
 * fica (mesma `key`).
 *
 * Parecer do Codex (24/10/2026): a pendência só sai depois de uma
 * sincronização que deu certo (confirmação feita durante a requisição continua
 * pendente), falha tenta de novo, e aba escondida ou saída da tela são só
 * tentativas a mais. Navegação que precisa dos dados atuais espera
 * `sincronizarAgora`. */
export function useSincronizarCotacao(): { agendar: () => void; sincronizarAgora: () => Promise<void> } {
  const agendado = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geracao = useRef(0);
  const sincronizada = useRef(0);

  const limparTimer = useCallback(() => {
    if (agendado.current) clearTimeout(agendado.current);
    agendado.current = null;
  }, []);

  // Uma requisição por vez: timer, aba escondida, saída e troca de contagem
  // podem chamar juntos; quem chega no meio espera a que está em voo e só
  // abre outra se ainda sobrar confirmação pendente.
  const emVoo = useRef<Promise<void> | null>(null);

  const sincronizarAgora = useCallback(async () => {
    limparTimer();
    while (emVoo.current) await emVoo.current;
    if (geracao.current <= sincronizada.current) return;
    const rodada = (async () => {
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        const alvo = geracao.current;
        try {
          await sincronizarCotacaoAction();
          sincronizada.current = Math.max(sincronizada.current, alvo);
          return;
        } catch {
          if (tentativa < MAX_TENTATIVAS) {
            await new Promise((resolver) => setTimeout(resolver, ESPERA_NOVA_TENTATIVA_MS));
          }
        }
      }
    })();
    emVoo.current = rodada;
    try {
      await rodada;
    } finally {
      emVoo.current = null;
    }
  }, [limparTimer]);

  useEffect(() => {
    function aoEsconder() {
      if (document.visibilityState === "hidden" && geracao.current > sincronizada.current) {
        void sincronizarAgora();
      }
    }
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      if (geracao.current > sincronizada.current) void sincronizarAgora();
      limparTimer();
    };
  }, [sincronizarAgora, limparTimer]);

  const agendar = useCallback(() => {
    geracao.current += 1;
    limparTimer();
    agendado.current = setTimeout(() => void sincronizarAgora(), ESPERA_MS);
  }, [sincronizarAgora, limparTimer]);

  return { agendar, sincronizarAgora };
}
