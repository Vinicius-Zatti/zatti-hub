"use client";

import { useState } from "react";
import { formatarNumeroCampo, interpretarNumeroDigitado } from "@/lib/numero-campo";

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
    if (edicao !== null) return; // texto não numérico mantido do blur anterior
    setEdicao(value === null ? "" : String(value).replace(".", ","));
  }

  function aoAlterar(texto: string) {
    setEdicao(texto);
    // Atualiza a fonte real enquanto digita. Se deixasse só no blur, o
    // último campo antes de Salvar poderia enviar o valor anterior.
    onChange(interpretarNumeroDigitado(texto));
  }

  function aoDesfocar() {
    // Texto que não virou número fica na tela como foi digitado (campo segue
    // marcado como vazio) - nunca apaga o que a pessoa escreveu.
    if (edicao !== null && edicao.trim() !== "" && interpretarNumeroDigitado(edicao) === null) return;
    setEdicao(null);
  }

  const texto = edicao !== null ? edicao : formatarNumeroCampo(value, decimais);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      onFocus={aoFocar}
      onChange={(e) => aoAlterar(e.target.value)}
      onBlur={aoDesfocar}
      className={`rounded border px-1.5 py-1 text-right ${
        value === null ? VAZIO_CLASSE : NORMAL_CLASSE
      } ${className}`}
    />
  );
}
