"use client";

import { useEffect, useRef, useState } from "react";

export type OpcaoCodigo = { codigo: string; descricao: string };

/** Select customizado: fechado mostra só o código (curto, bom pra tabela
 * densa), aberto mostra "CÓDIGO — descrição" pra quem tá escolhendo saber
 * o que cada sigla significa. */
export function CodigoSelect({
  value,
  opcoes,
  onChange,
  placeholder = "—",
  className = "",
}: {
  value: string;
  opcoes: OpcaoCodigo[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full rounded border border-cinza-claro bg-branco px-1.5 py-1 text-left font-mono text-xs text-cinza hover:border-ambar"
      >
        {value || placeholder}
      </button>
      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-56 w-max min-w-full overflow-y-auto rounded-md border border-cinza-claro bg-branco shadow-lg">
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
        </div>
      )}
    </div>
  );
}
