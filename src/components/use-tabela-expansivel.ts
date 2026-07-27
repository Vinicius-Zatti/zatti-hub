"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Controla o estado de "tabela em tela cheia" - Esc fecha e trava o
 * scroll do body enquanto expandido, pra não rolar a página por trás.
 *
 * Também guarda e restaura a posição de scroll da PÁGINA (não da tabela):
 * o container expandido vira `position: fixed`, que some da altura normal
 * do fluxo da página enquanto ativo - ao voltar pro normal, o navegador
 * perde a posição de scroll de antes e volta pro topo. Guarda
 * `window.scrollY` no instante de expandir e restaura depois de fechar. */
export function useTabelaExpansivel() {
  const [expandido, setExpandido] = useState(false);
  const scrollSalvoRef = useRef<number | null>(null);

  const alternar = useCallback(() => {
    setExpandido((atual) => {
      if (!atual) scrollSalvoRef.current = window.scrollY;
      return !atual;
    });
  }, []);

  useEffect(() => {
    if (expandido || scrollSalvoRef.current === null) return;
    const y = scrollSalvoRef.current;
    scrollSalvoRef.current = null;
    // Espera o layout recalcular (o container voltou ao fluxo normal)
    // antes de restaurar, senão o scrollTo não tem altura de página
    // suficiente ainda pra chegar em `y`.
    const id = requestAnimationFrame(() => window.scrollTo(0, y));
    return () => cancelAnimationFrame(id);
  }, [expandido]);

  useEffect(() => {
    if (!expandido) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setExpandido(false);
    }
    document.addEventListener("keydown", aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [expandido]);

  return { expandido, alternar };
}
