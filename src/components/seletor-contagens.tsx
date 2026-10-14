"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DicaCalculo } from "@/components/dica-calculo";
import type { AndamentoSetor } from "@/lib/contagem/setor";
import { datasComplementares, motivoBloqueioContagem } from "@/lib/contagem/varias-datas";

/** Como o estoque atual é montado quando a Cotação junta mais de uma
 * contagem - mesmo texto no aviso e na coluna "Estoque atual". */
export const DICA_VARIAS_CONTAGENS =
  "Só dá pra juntar contagens que se completam: a mais recente ainda tem setor pendente e a outra " +
  "fechou esse setor. Pra cada produto, cada setor entra com a contagem mais recente dele entre as " +
  "datas marcadas, e o estoque atual é a soma dos setores (a mesma conta de uma data só). O mesmo " +
  "setor nunca é somado duas vezes. A tabela mostra de qual data veio cada item. O pedido fica " +
  "gravado na contagem base (a data mais recente).";

/** Filtro "Contagem" de Criar Cotação e Editor de Espelhos (13/10/2026), no
 * jeito do filtro de datas do Excel: um botão que abre a lista de datas com
 * caixinhas. Padrão é só a mais recente. Outra data só pode ser marcada se
 * completa a contagem marcada (regra em `lib/contagem/varias-datas.ts`, que o
 * servidor repete). Mesmo dropdown de `BotaoColunasDre` (portal, fecha ao
 * clicar fora); a escolha vale ao clicar em Aplicar, porque cada troca
 * recarrega a cotação. */
export function SeletorContagens({
  datasDisponiveis,
  datasUsadas,
  andamentoPorData,
  onChange,
}: {
  /** Mais recente primeiro. */
  datasDisponiveis: string[];
  /** Mais recente primeiro; a primeira é a contagem base. */
  datasUsadas: string[];
  /** Setores de cada data (vazio = contagem sem setor, vale sozinha). */
  andamentoPorData: Record<string, AndamentoSetor[]>;
  onChange: (datas: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>(datasUsadas);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function reposicionar() {
    const rect = botaoRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosicao({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)) });
  }

  useLayoutEffect(() => {
    if (aberto) reposicionar();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (botaoRef.current?.contains(alvo) || menuRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("scroll", reposicionar, true);
    window.addEventListener("resize", reposicionar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("scroll", reposicionar, true);
      window.removeEventListener("resize", reposicionar);
    };
  }, [aberto]);

  function abrirOuFechar() {
    // Reabrir sempre parte do que está valendo na tela, não de um rascunho
    // que ficou sem aplicar.
    if (!aberto) setMarcadas(datasUsadas);
    setAberto((a) => !a);
  }

  // Unidade sem contagem por setor (legada/planilha): uma data só, escolha simples.
  const umaSo = Object.values(andamentoPorData).every((setores) => setores.length === 0);

  function alternar(data: string) {
    if (umaSo) {
      setMarcadas([data]);
      return;
    }
    const proximas = marcadas.includes(data) ? marcadas.filter((d) => d !== data) : [...marcadas, data];
    setMarcadas(datasComplementares(proximas, andamentoPorData));
  }

  function aplicar() {
    setAberto(false);
    if (marcadas.join(",") !== datasUsadas.join(",")) onChange(marcadas);
  }

  const rotulo = datasUsadas.length > 1 ? `${datasUsadas[0]} + ${datasUsadas.length - 1}` : (datasUsadas[0] ?? "-");

  return (
    <div className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
      Contagem
      <button
        ref={botaoRef}
        type="button"
        onClick={abrirOuFechar}
        aria-expanded={aberto}
        className="flex items-center gap-2 rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm font-normal text-cinza hover:border-ambar"
      >
        {rotulo}
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 text-cinza-medio" fill="currentColor">
          <path d="M5.5 7.5 10 12l4.5-4.5z" />
        </svg>
      </button>
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: posicao.top, left: posicao.left }}
            className="z-50 w-72 rounded-md border border-cinza-claro bg-branco shadow-lg"
          >
            <div className="max-h-72 overflow-y-auto p-2">
              {datasDisponiveis.map((data) => {
                const marcada = marcadas.includes(data);
                const motivo = umaSo ? null : motivoBloqueioContagem(marcadas, data, andamentoPorData);
                return (
                  <label
                    key={data}
                    className={`flex items-start gap-2 rounded px-2 py-1.5 text-sm ${
                      motivo ? "cursor-not-allowed text-cinza-medio" : "cursor-pointer text-cinza hover:bg-off-white"
                    }`}
                  >
                    <input
                      type={umaSo ? "radio" : "checkbox"}
                      checked={marcada}
                      disabled={motivo !== null}
                      onChange={() => alternar(data)}
                      className="mt-0.5 h-3.5 w-3.5"
                    />
                    <span className="flex flex-col">
                      {data}
                      {motivo && <span className="text-[11px] font-normal">{motivo}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex border-t border-cinza-claro">
              <button
                type="button"
                onClick={aplicar}
                disabled={marcadas.length === 0}
                className="flex-1 px-3 py-1.5 text-left text-xs font-semibold text-ambar hover:bg-ambar/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Único aviso de cotação com mais de uma contagem - só aparece depois de
 * marcar mais de uma data no filtro. */
export function AvisoVariasContagens({ datasUsadas }: { datasUsadas: string[] }) {
  if (datasUsadas.length < 2) return null;
  return (
    <p className="flex items-center gap-1 rounded-md border border-ambar/60 bg-ambar/10 px-3 py-2 text-xs font-medium text-ambar">
      Esta cotação junta mais de uma contagem: {datasUsadas.join(" e ")}. O pedido fica gravado na de{" "}
      {datasUsadas[0]}.
      <DicaCalculo rotulo="Estoque atual com mais de uma contagem" texto={DICA_VARIAS_CONTAGENS} />
    </p>
  );
}
