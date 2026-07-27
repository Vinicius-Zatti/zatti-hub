"use client";

import { useEffect, useState } from "react";

/** Controla o estado de "tabela em tela cheia" - Esc fecha e trava o
 * scroll do body enquanto expandido, pra não rolar a página por trás. */
export function useTabelaExpansivel() {
  const [expandido, setExpandido] = useState(false);

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

  return { expandido, alternar: () => setExpandido((e) => !e) };
}
