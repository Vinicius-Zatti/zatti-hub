"use client";

import { useMemo, useState } from "react";
import type { ConsolidadoVenda } from "@/lib/types";

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function paraISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hojeISO(): string {
  return paraISO(new Date());
}

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return paraISO(dt);
}

export type PeriodoAplicado = { de: string; ate: string };

/** Filtro de período reaproveitado no Histórico e no Dashboard do
 * Consolidado de Vendas - "De/Até" manual, ou um atalho de "Período
 * corrente" (últimos 7 dias, últimos 30 dias, ou um dos últimos 12 meses que
 * realmente tem lançamento). Só filtra de verdade no clique de "Aplicar" -
 * editar os campos não refiltra sozinho, pra não recalcular a cada tecla. */
export function FiltroPeriodo({
  lancamentos,
  onAplicar,
}: {
  lancamentos: ConsolidadoVenda[];
  onAplicar: (periodo: PeriodoAplicado) => void;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [preset, setPreset] = useState("");

  const mesesDisponiveis = useMemo(() => {
    const hoje = new Date();
    const opcoes: { valor: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const temDado = lancamentos.some((l) => l.data.startsWith(chave));
      if (temDado) opcoes.push({ valor: chave, label: NOMES_MES[d.getMonth()] });
    }
    return opcoes;
  }, [lancamentos]);

  function aplicarPreset(valor: string) {
    setPreset(valor);
    if (valor === "7dias") {
      setAte(hojeISO());
      setDe(somarDias(hojeISO(), -6));
    } else if (valor === "30dias") {
      setAte(hojeISO());
      setDe(somarDias(hojeISO(), -29));
    } else if (/^\d{4}-\d{2}$/.test(valor)) {
      const [ano, mes] = valor.split("-").map(Number);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      setDe(`${valor}-01`);
      setAte(`${valor}-${String(ultimoDia).padStart(2, "0")}`);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
        De
        <input
          type="date"
          value={de}
          onChange={(e) => {
            setDe(e.target.value);
            setPreset("");
          }}
          className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
        Até
        <input
          type="date"
          value={ate}
          onChange={(e) => {
            setAte(e.target.value);
            setPreset("");
          }}
          className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
        Período corrente
        <select
          value={preset}
          onChange={(e) => aplicarPreset(e.target.value)}
          className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
        >
          <option value="">Personalizado</option>
          <option value="7dias">Últimos 7 dias</option>
          <option value="30dias">Últimos 30 dias</option>
          {mesesDisponiveis.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => onAplicar({ de, ate })}
        className="rounded-md bg-ambar px-4 py-1.5 text-sm font-bold text-azul-noite hover:bg-[#b07720]"
      >
        Aplicar
      </button>
    </div>
  );
}
