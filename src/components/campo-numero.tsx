"use client";

import { useState } from "react";

const VAZIO_CLASSE = "border-ambar bg-ambar/10";
const NORMAL_CLASSE = "border-cinza-claro bg-branco";

/** Input numérico que mostra ponto de milhares quando não está em foco (fácil
 * de ler) e o valor cru, editável, enquanto a pessoa está digitando. */
export function CampoNumero({
  value,
  onChange,
  className = "",
  decimais = 2,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  decimais?: number;
}) {
  // null = não está em edição (mostra o valor formatado vindo das props)
  const [edicao, setEdicao] = useState<string | null>(null);

  function aoFocar() {
    setEdicao(value === null ? "" : String(value).replace(".", ","));
  }

  function aoDesfocar() {
    const limpo = (edicao ?? "").trim();
    setEdicao(null);
    if (limpo === "") {
      onChange(null);
      return;
    }
    const num = Number(limpo.replace(/\./g, "").replace(",", "."));
    onChange(Number.isNaN(num) ? null : num);
  }

  const texto = edicao !== null ? edicao : formatar(value, decimais);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      onFocus={aoFocar}
      onChange={(e) => setEdicao(e.target.value)}
      onBlur={aoDesfocar}
      className={`rounded border px-1.5 py-1 text-right ${
        value === null ? VAZIO_CLASSE : NORMAL_CLASSE
      } ${className}`}
    />
  );
}

function formatar(value: number | null, decimais: number): string {
  if (value === null) return "";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: decimais });
}
