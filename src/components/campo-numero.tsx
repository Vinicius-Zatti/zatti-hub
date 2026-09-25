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
    if (edicao !== null) return; // texto não numérico mantido do blur anterior
    setEdicao(value === null ? "" : String(value).replace(".", ","));
  }

  function interpretar(texto: string): number | null {
    // "R$ 1.500,00" colado ou digitado vale 1500 (antes virava NaN e o campo
    // aparecia vazio ao sair dele).
    const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
    if (limpo === "") {
      return null;
    }
    const num = Number(limpo.replace(/\./g, "").replace(",", "."));
    return Number.isNaN(num) ? null : num;
  }

  function aoAlterar(texto: string) {
    setEdicao(texto);
    // Atualiza a fonte real enquanto digita. Se deixasse só no blur, o
    // último campo antes de Salvar poderia enviar o valor anterior.
    onChange(interpretar(texto));
  }

  function aoDesfocar() {
    // Texto que não virou número fica na tela como foi digitado (campo segue
    // marcado como vazio) - nunca apaga o que a pessoa escreveu.
    if (edicao !== null && edicao.trim() !== "" && interpretar(edicao) === null) return;
    setEdicao(null);
  }

  const texto = edicao !== null ? edicao : formatar(value, decimais);

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

function formatar(value: number | null, decimais: number): string {
  if (value === null) return "";
  // minimum = maximum: sem isso, um valor sem parte fracionária (ex: 1300)
  // aparece sem decimal nenhum enquanto outro com fração (ex: 1,1) aparece
  // com decimal variável - mesma coluna mostrando formatos diferentes.
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}
