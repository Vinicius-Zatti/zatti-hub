"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Círculo com "i" ao lado de todo dado calculado (regra de 25/09): mostra
 * como o número é calculado, em linguagem simples e com a fórmula. Abre no
 * hover, no foco por teclado e no toque (celular); fecha ao sair, com Esc ou
 * tocando fora. A caixa vai por portal pro `document.body` com posição fixa,
 * pra não ser cortada pelo `overflow-auto` das tabelas (mesmo motivo de
 * `SeletorComBusca`). O `InfoIcon` antigo usa só `title` nativo, que não
 * funciona no toque nem no teclado - por isso este componente. */
export function DicaCalculo({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [aberta, setAberta] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  function abrir() {
    const rect = botaoRef.current?.getBoundingClientRect();
    if (rect) setPosicao({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - 296)) });
    setAberta(true);
  }

  useEffect(() => {
    if (!aberta) return;
    function fechar(e: Event) {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && botaoRef.current?.contains(e.target as Node)) return;
      setAberta(false);
    }
    document.addEventListener("keydown", fechar);
    document.addEventListener("pointerdown", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("keydown", fechar);
      document.removeEventListener("pointerdown", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberta]);

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        aria-label={`Como é calculado: ${rotulo}`}
        aria-describedby={aberta ? id : undefined}
        // Mouse abre no hover; toque abre/fecha no clique; teclado abre no foco
        // visível (Tab) - separados pra um toque não abrir e fechar de uma vez.
        onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAberta(false)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && abrir()}
        onBlur={() => setAberta(false)}
        onClick={(e) => {
          e.stopPropagation();
          // Com mouse o hover já controla; clique só alterna no toque/teclado.
          if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
          if (aberta) setAberta(false);
          else abrir();
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-cinza-medio/60 text-[10px] font-bold italic leading-none text-cinza-medio hover:border-azul-petroleo hover:text-azul-petroleo focus:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
      >
        i
      </button>
      {aberta &&
        posicao &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ position: "fixed", top: posicao.top, left: posicao.left }}
            className="z-50 w-72 rounded-md border border-cinza-claro bg-branco p-3 text-xs font-normal not-italic leading-relaxed text-cinza shadow-lg"
          >
            {texto}
          </div>,
          document.body,
        )}
    </>
  );
}
