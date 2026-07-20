"use client";

import { useEffect, useRef, useState } from "react";

const EDITAVEL = "input, select, textarea, button, [role='button']";

function focoEmCampo(): boolean {
  const el = document.activeElement;
  return !!el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
}

/** Arrasta pelo fundo da tabela pra rolar (mãozinha). Clicar num campo
 * editável continua funcionando normal. Segurando espaço (fora de um
 * campo em foco), o arrasto funciona mesmo começando em cima de um campo. */
export function useArrastarParaRolar<T extends HTMLElement>() {
  const scrollRef = useRef<T>(null);
  const arrasto = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [espacoPressionado, setEspacoPressionado] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !focoEmCampo()) {
        e.preventDefault();
        setEspacoPressionado(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setEspacoPressionado(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!arrastando) return;
    function onMove(e: MouseEvent) {
      if (!arrasto.current || !scrollRef.current) return;
      scrollRef.current.scrollLeft = arrasto.current.left - (e.clientX - arrasto.current.x);
      scrollRef.current.scrollTop = arrasto.current.top - (e.clientY - arrasto.current.y);
    }
    function onUp() {
      arrasto.current = null;
      setArrastando(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [arrastando]);

  function onMouseDown(e: React.MouseEvent) {
    const alvo = e.target as HTMLElement;
    const emEditavel = !!alvo.closest(EDITAVEL);
    if (emEditavel && !espacoPressionado) return; // deixa o clique normal acontecer
    if (emEditavel && espacoPressionado) e.preventDefault(); // segurando espaço, não foca o campo
    if (!scrollRef.current) return;
    arrasto.current = {
      x: e.clientX,
      y: e.clientY,
      left: scrollRef.current.scrollLeft,
      top: scrollRef.current.scrollTop,
    };
    setArrastando(true);
  }

  return {
    scrollRef,
    handlers: { onMouseDown },
    arrastando,
    espacoPressionado,
  };
}
