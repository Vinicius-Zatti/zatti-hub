"use client";

import { useCallback, useEffect, useRef } from "react";
import { sincronizarCotacaoAction } from "@/app/(app)/estoque/pedidos/cotacoes/actions";

const ESPERA_MS = 2500;

/** Confirmar na Criar Cotação e no Editor de Espelhos não revalida mais a cada
 * clique (fase 3 de velocidade, 23/10/2026). Sem nenhuma revalidação, o
 * voltar/avançar do navegador remontava a tela como ela era antes das
 * confirmações. Este hook agenda uma sincronização depois de uma pausa nos
 * cliques e dispara na hora ao sair da tela: um recálculo por pausa, em vez
 * de um por clique. O estado digitado fica (mesma `key`). */
export function useSincronizarCotacao(): () => void {
  const agendado = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disparar = useCallback(() => {
    if (agendado.current) clearTimeout(agendado.current);
    agendado.current = null;
    sincronizarCotacaoAction().catch(() => {});
  }, []);

  useEffect(
    () => () => {
      if (agendado.current) disparar();
    },
    [disparar]
  );

  return useCallback(() => {
    if (agendado.current) clearTimeout(agendado.current);
    agendado.current = setTimeout(disparar, ESPERA_MS);
  }, [disparar]);
}
