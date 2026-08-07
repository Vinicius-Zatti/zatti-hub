"use client";

import type { RefObject } from "react";
import { BotaoExpandir } from "@/components/botao-expandir";
import { useArrastarParaRolar } from "@/components/use-arrastar-para-rolar";
import { useTabelaExpansivel } from "@/components/use-tabela-expansivel";

export function ControlesTabela({
  scrollRef,
  expandido,
  onAlternarExpandir,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  expandido: boolean;
  onAlternarExpandir: () => void;
}) {
  function rolar(direcao: -1 | 1) {
    const elemento = scrollRef.current;
    if (!elemento) return;
    elemento.scrollBy({
      left: direcao * Math.max(280, elemento.clientWidth * 0.72),
      behavior: "smooth",
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 hidden items-center gap-1.5 text-xs text-cinza-medio sm:flex">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 11V7a2 2 0 0 1 4 0v4-5a2 2 0 0 1 4 0v5-3a2 2 0 0 1 4 0v6c0 4-3 7-7 7h-1c-3 0-5-1-7-4l-2-3a2 2 0 0 1 3-2l2 2" />
        </svg>
        Arraste para os lados
      </span>
      <BotaoRolagem direcao="esquerda" onClick={() => rolar(-1)} />
      <BotaoRolagem direcao="direita" onClick={() => rolar(1)} />
      <BotaoExpandir expandido={expandido} onClick={onAlternarExpandir} />
    </div>
  );
}

function BotaoRolagem({
  direcao,
  onClick,
}: {
  direcao: "esquerda" | "direita";
  onClick: () => void;
}) {
  const esquerda = direcao === "esquerda";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Rolar tabela para a ${direcao}`}
      title={`Rolar para a ${direcao}`}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-cinza-claro bg-branco text-cinza-medio transition-colors hover:border-ambar hover:text-ambar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={esquerda ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}

export function TabelaRolavel({
  children,
  className = "max-h-[70vh] rounded-lg border border-cinza-claro bg-branco",
  ariaLabel = "Tabela de dados",
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const { expandido, alternar } = useTabelaExpansivel();
  const { scrollRef, handlers, arrastando } = useArrastarParaRolar<HTMLDivElement>();

  return (
    <div className={expandido ? "fixed inset-0 z-40 flex flex-col gap-2 bg-branco p-3" : "flex flex-col gap-2"}>
      <div className="flex items-center justify-end">
        <ControlesTabela scrollRef={scrollRef} expandido={expandido} onAlternarExpandir={alternar} />
      </div>
      <div
        ref={scrollRef}
        {...handlers}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className={`${className} overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
          expandido ? "!min-h-0 !max-h-none flex-1" : ""
        } ${arrastando ? "cursor-grabbing select-none" : "cursor-grab"}`}
      >
        {children}
      </div>
    </div>
  );
}
