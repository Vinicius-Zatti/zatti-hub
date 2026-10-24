"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { posicionarBalao } from "@/lib/posicao-balao";

/** Círculo com "i" ao lado de todo dado calculado (regra de 25/09): mostra
 * como o número é calculado, em linguagem simples e com a fórmula. Abre no
 * hover (mouse), no foco por teclado e no toque (celular); fecha ao sair com o
 * mouse, com Esc, tocando fora ou tocando de novo no "i". A caixa vai por
 * portal pro `document.body` com posição fixa, pra não ser cortada pelo
 * `overflow-auto` das tabelas (mesmo motivo de `SeletorComBusca`). O
 * `InfoIcon` antigo usa só `title` nativo, que não funciona no toque nem no
 * teclado - por isso este componente.
 *
 * Correção de 24/10/2026 (não abria no celular): o tipo do ponteiro vinha do
 * evento de clique, e no Safari do iPhone o clique gerado por um toque chega
 * como "mouse" - o toque caía no ramo do hover e nunca abria. Agora o tipo vem
 * do `pointerdown` do próprio botão, que é confiável. A rolagem também não
 * fecha mais o balão (no celular qualquer ajuste de rolagem logo após o toque
 * fechava na hora): ela só reposiciona. */
export function DicaCalculo({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [aberta, setAberta] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const balaoRef = useRef<HTMLDivElement>(null);
  // Tipo do último `pointerdown` no botão ("mouse", "touch", "pen"); vazio
  // quando o clique veio do teclado (Enter/Espaço).
  const ponteiroRef = useRef("");
  const id = useId();

  const posicionar = useCallback(() => {
    const botao = botaoRef.current?.getBoundingClientRect();
    if (!botao) return;
    const balao = balaoRef.current?.getBoundingClientRect();
    setPosicao(
      posicionarBalao(botao, { largura: balao?.width ?? 288, altura: balao?.height ?? 0 }, {
        largura: window.innerWidth,
        altura: window.innerHeight,
      }),
    );
  }, []);

  function abrir() {
    posicionar();
    setAberta(true);
  }

  // Com o balão já no DOM, mede o tamanho real e acerta a posição (vira para
  // cima quando não cabe embaixo, nunca sai pela lateral).
  useLayoutEffect(() => {
    if (aberta) posicionar();
  }, [aberta, posicionar]);

  useEffect(() => {
    if (!aberta) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberta(false);
    }
    function aoTocarFora(e: PointerEvent) {
      const alvo = e.target as Node;
      if (botaoRef.current?.contains(alvo) || balaoRef.current?.contains(alvo)) return;
      setAberta(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoTocarFora);
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocarFora);
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberta, posicionar]);

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        aria-label={`Como é calculado: ${rotulo}`}
        aria-expanded={aberta}
        aria-describedby={aberta ? id : undefined}
        onPointerDown={(e) => {
          ponteiroRef.current = e.pointerType;
        }}
        // Mouse: abre no hover e fecha ao sair. Toque e caneta não usam hover.
        onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAberta(false)}
        // Teclado: abre no foco visível (Tab); sair do botão fecha.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && abrir()}
        onBlur={() => setAberta(false)}
        onClick={(e) => {
          // O "i" fica por cima de cartões que são links: o toque não navega.
          e.preventDefault();
          e.stopPropagation();
          const ponteiro = ponteiroRef.current;
          ponteiroRef.current = "";
          // Mouse: o hover já abriu; o clique só garante aberto (sem piscar).
          if (ponteiro === "mouse") return abrir();
          // Toque, caneta e teclado (Enter/Espaço): abre e fecha.
          if (aberta) setAberta(false);
          else abrir();
        }}
        className="inline-flex h-4 w-4 shrink-0 touch-manipulation items-center justify-center rounded-full border border-cinza-medio/60 text-[10px] font-bold italic leading-none text-cinza-medio relative before:absolute before:-inset-2 before:content-[''] hover:border-azul-petroleo hover:text-azul-petroleo focus:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
      >
        i
      </button>
      {aberta &&
        createPortal(
          <div
            ref={balaoRef}
            id={id}
            role="tooltip"
            style={{
              position: "fixed",
              top: posicao?.top ?? 0,
              left: posicao?.left ?? 0,
              // Antes de medir, fica invisível para não piscar no canto.
              visibility: posicao ? "visible" : "hidden",
            }}
            className="z-50 w-72 max-w-[calc(100vw-16px)] rounded-md border border-cinza-claro bg-branco p-3 text-xs font-normal not-italic normal-case leading-relaxed tracking-normal text-cinza shadow-lg"
          >
            {texto}
          </div>,
          document.body,
        )}
    </>
  );
}
