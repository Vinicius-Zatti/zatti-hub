"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type OpcaoCodigo = { codigo: string; descricao: string };

/** Select customizado: fechado mostra só o código (curto, bom pra tabela
 * densa), aberto mostra "CÓDIGO — descrição" pra quem tá escolhendo saber
 * o que cada sigla significa. A lista de opções é renderizada num portal
 * (document.body) em vez de dentro do fluxo normal, porque toda tabela
 * densa do app rola dentro de um container com `overflow-auto` - um
 * dropdown `position: absolute` normal fica cortado por esse overflow
 * (aparenta "sem scroll", força rolar a tabela inteira em vez da lista). */
export function CodigoSelect({
  value,
  opcoes,
  onChange,
  placeholder = "—",
  className = "",
  extra,
}: {
  value: string;
  opcoes: OpcaoCodigo[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Ação fixada no rodapé da lista, separada por uma borda (ex: "+ Adicionar fornecedor"). */
  extra?: { label: string; onClick: () => void };
}) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  function reposicionar() {
    const rect = botaoRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosicao({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  useLayoutEffect(() => {
    if (aberto) reposicionar();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (botaoRef.current?.contains(alvo)) return;
      if (listaRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    function aoRolarOuRedimensionar() {
      reposicionar();
    }
    document.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("scroll", aoRolarOuRedimensionar, true);
    window.addEventListener("resize", aoRolarOuRedimensionar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("scroll", aoRolarOuRedimensionar, true);
      window.removeEventListener("resize", aoRolarOuRedimensionar);
    };
  }, [aberto]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full rounded border border-cinza-claro bg-branco px-1.5 py-1 text-left font-mono text-xs text-cinza hover:border-ambar"
      >
        {value || placeholder}
      </button>
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={listaRef}
            style={{ position: "fixed", top: posicao.top, left: posicao.left, minWidth: posicao.width }}
            className="z-50 max-h-56 w-max overflow-y-auto rounded-md border border-cinza-claro bg-branco shadow-lg"
          >
            {opcoes.map((o) => (
              <button
                key={o.codigo}
                type="button"
                onClick={() => {
                  onChange(o.codigo);
                  setAberto(false);
                }}
                className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs hover:bg-off-white ${
                  o.codigo === value ? "bg-ambar/10 font-semibold text-azul-noite" : "text-cinza"
                }`}
              >
                {o.codigo} — {o.descricao}
              </button>
            ))}
            {extra && (
              <button
                type="button"
                onClick={() => {
                  setAberto(false);
                  extra.onClick();
                }}
                className="block w-full whitespace-nowrap border-t border-cinza-claro px-3 py-1.5 text-left text-xs font-semibold text-ambar hover:bg-ambar/10"
              >
                {extra.label}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
