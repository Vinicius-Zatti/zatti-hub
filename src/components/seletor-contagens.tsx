"use client";

import { DicaCalculo } from "@/components/dica-calculo";

/** Como o estoque atual é montado quando a Cotação junta mais de uma
 * contagem - mesmo texto no seletor e na coluna "Estoque atual". */
export const DICA_VARIAS_CONTAGENS =
  "Junta as contagens marcadas num estoque só. Pra cada produto, cada setor entra com a contagem " +
  "mais recente dele entre as datas marcadas, e o estoque atual é a soma dos setores (a mesma conta " +
  "de uma data só). O mesmo setor nunca é somado duas vezes: se contou nas duas datas, vale só a " +
  "última. Produto que fica num setor só usa a contagem mais recente em que foi contado. A tabela " +
  "mostra de qual data veio cada item. O pedido fica gravado na contagem base (a data mais recente).";

/** Quantas contagens anteriores aparecem pra juntar - compra é semanal, o
 * que importa está perto da base. Data já marcada aparece sempre. */
const CHIPS_ANTERIORES = 8;

/** Seletor de contagem base de Criar Cotação e Editor de Espelhos (13/10/2026):
 * a base é sempre a mais recente das marcadas; "Juntar com" lista só datas
 * anteriores a ela, então trocar a base nunca deixa marcada uma data mais nova. */
export function SeletorContagens({
  datasDisponiveis,
  datasUsadas,
  onChange,
}: {
  /** Mais recente primeiro (ordem de `datasDisponiveis`). */
  datasDisponiveis: string[];
  /** Mais recente primeiro; a primeira é a contagem base. */
  datasUsadas: string[];
  onChange: (datas: string[]) => void;
}) {
  const base = datasUsadas[0] ?? "";
  const extras = datasUsadas.slice(1);
  const anteriores = datasDisponiveis.slice(datasDisponiveis.indexOf(base) + 1);
  const chips = anteriores.filter((d, i) => i < CHIPS_ANTERIORES || extras.includes(d));

  function trocarBase(nova: string) {
    const posicao = datasDisponiveis.indexOf(nova);
    onChange([nova, ...extras.filter((d) => datasDisponiveis.indexOf(d) > posicao)]);
  }

  function alternar(data: string) {
    onChange(extras.includes(data) ? [base, ...extras.filter((d) => d !== data)] : [base, ...extras, data]);
  }

  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
        Contagem base
        <select
          value={base}
          onChange={(e) => trocarBase(e.target.value)}
          className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
        >
          {datasDisponiveis.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {chips.length > 0 && (
        <div className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          <span className="flex items-center gap-1">
            Juntar com contagem anterior
            <DicaCalculo rotulo="Estoque atual com mais de uma contagem" texto={DICA_VARIAS_CONTAGENS} />
          </span>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => alternar(d)}
                aria-pressed={extras.includes(d)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  extras.includes(d)
                    ? "border-ambar bg-ambar/10 text-ambar"
                    : "border-cinza-claro text-cinza-medio hover:border-ambar"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
