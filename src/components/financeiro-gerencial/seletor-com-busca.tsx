"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type OpcaoBusca = { id: string; label: string };

/** Seletor com busca por lupa - mesma mecânica de `CodigoSelect` (portal pra
 * fora do `overflow-auto` da página, reposiciona no scroll/resize, fecha ao
 * clicar fora), mas pensado pra campo de formulário de largura cheia com
 * `label` já pronto (ex: caminho "CMO > Folha salarial contábil") em vez do
 * par código/descrição em fonte mono de `CodigoSelect` (esse é usado em
 * célula de tabela densa do Estoque, fora do escopo desta correção - por
 * isso um componente novo em vez de esticar aquele). Item 3 da correção de
 * 25/08 do Financeiro gerencial. */
export function SeletorComBusca({
  value,
  opcoes,
  onChange,
  placeholder = "Selecionar...",
  vazioLabel,
  className = "",
}: {
  value: string;
  opcoes: OpcaoBusca[];
  onChange: (id: string) => void;
  placeholder?: string;
  /** Quando informado, mostra essa opção no topo da lista com valor "" - ex:
   * "Nenhuma (decidir na baixa)" pra Conta Financeira opcional. */
  vazioLabel?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width: number } | null>(null);
  const [termo, setTermo] = useState("");
  const botaoRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const inputBuscaRef = useRef<HTMLInputElement>(null);

  const selecionada = opcoes.find((o) => o.id === value);
  const rotuloAtual = value === "" ? (vazioLabel ?? placeholder) : (selecionada?.label ?? placeholder);

  const opcoesFiltradas = opcoes.filter((o) => {
    const alvo = termo.trim().toLowerCase();
    return !alvo || o.label.toLowerCase().includes(alvo);
  });

  function reposicionar() {
    const rect = botaoRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosicao({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  useLayoutEffect(() => {
    if (aberto) reposicionar();
  }, [aberto]);

  useEffect(() => {
    if (aberto) inputBuscaRef.current?.focus();
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
        onClick={() => {
          setAberto((a) => !a);
          setTermo("");
        }}
        className={`w-full truncate rounded-md border border-cinza-claro bg-branco px-3 py-2 text-left text-sm hover:border-ambar ${
          value === "" && !vazioLabel ? "text-cinza-medio" : "text-cinza"
        }`}
      >
        {rotuloAtual}
      </button>
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={listaRef}
            style={{ position: "fixed", top: posicao.top, left: posicao.left, width: posicao.width }}
            className="z-50 rounded-md border border-cinza-claro bg-branco shadow-lg"
          >
            <div className="flex items-center gap-1.5 border-b border-cinza-claro px-2 py-1.5">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 shrink-0 text-cinza-medio"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputBuscaRef}
                type="text"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Buscar..."
                className="w-full text-sm text-cinza outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {vazioLabel && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setAberto(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-off-white ${
                    value === "" ? "bg-ambar/10 font-semibold text-azul-noite" : "text-cinza-medio"
                  }`}
                >
                  {vazioLabel}
                </button>
              )}
              {opcoesFiltradas.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setAberto(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-off-white ${
                    o.id === value ? "bg-ambar/10 font-semibold text-azul-noite" : "text-cinza"
                  }`}
                >
                  {o.label}
                </button>
              ))}
              {opcoesFiltradas.length === 0 && (
                <div className="px-3 py-2 text-sm text-cinza-medio">Nada encontrado.</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
