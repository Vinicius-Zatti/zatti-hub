"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ConsolidadoVenda } from "@/lib/types";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { FiltroPeriodo, type PeriodoAplicado } from "@/components/filtro-periodo";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function dataHoraBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type FiltroStatus = "todos" | "conferido" | "divergente";

/** Histórico de fechamentos diários, com filtro por período (De/Até ou
 * atalho de período corrente, só filtra ao clicar "Aplicar") e status (esse
 * sim já filtra na hora). */
export function ConsolidadoTabela({
  lancamentos,
  podeEditar,
}: {
  lancamentos: ConsolidadoVenda[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusInicial = searchParams.get("status");
  const [periodo, setPeriodo] = useState<PeriodoAplicado>({ de: "", ate: "" });
  const [status, setStatus] = useState<FiltroStatus>(
    statusInicial === "conferido" || statusInicial === "divergente" ? statusInicial : "todos"
  );

  const filtrados = useMemo(() => {
    return lancamentos
      .filter((l) => !periodo.de || l.data >= periodo.de)
      .filter((l) => !periodo.ate || l.data <= periodo.ate)
      .filter((l) => status === "todos" || l.status === status)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
  }, [lancamentos, periodo, status]);

  const divergentesNoFiltro = filtrados.filter((l) => l.status === "divergente").length;
  const totalColunas = 12;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Consolidado de Vendas</h1>
        <p className="text-sm text-cinza-medio">Histórico dos fechamentos diários já registrados.</p>
      </div>

      <FiltroPeriodo lancamentos={lancamentos} onAplicar={setPeriodo} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FiltroStatus)}
            className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
          >
            <option value="todos">Todos</option>
            <option value="conferido">Conferido</option>
            <option value="divergente">Com divergência</option>
          </select>
        </label>
        <div className="ml-auto text-sm text-cinza-medio">
          {filtrados.length} {filtrados.length === 1 ? "lançamento" : "lançamentos"}
          {divergentesNoFiltro > 0 && (
            <span className="ml-2 font-semibold text-vermelho">
              · {divergentesNoFiltro} com divergência
            </span>
          )}
        </div>
      </div>

      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Histórico do consolidado de vendas">
        <table className="w-full min-w-[1260px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th fixo>{podeEditar ? "Data / ação" : "Data"}</Th>
              <Th align="right">Total formas de pagamento</Th>
              <Th align="right">Salão</Th>
              <Th align="right">Delivery próprio</Th>
              <Th align="right">iFood</Th>
              <Th align="right">99Food</Th>
              <Th align="right">Faturamento total</Th>
              <Th align="right">Total canais próprios</Th>
              <Th align="right">Diferença</Th>
              <Th>Status</Th>
              <Th>Responsável</Th>
              <Th>Última atualização</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((l, i) => (
              <tr key={l.id} className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}>
                <td
                  className={`sticky left-0 z-10 px-3 py-2 whitespace-nowrap font-medium text-cinza ${
                    i % 2 === 1 ? "bg-off-white" : "bg-branco"
                  }`}
                >
                  {podeEditar ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/financeiro/consolidado/${l.id}/editar`)}
                      className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded px-1 py-1 text-left transition-colors hover:bg-ambar/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
                      aria-label={`Editar lançamento de ${dataBR(l.data)}`}
                    >
                      <span>{dataBR(l.data)}</span>
                      <span className="rounded bg-azul-noite px-2 py-0.5 text-[10px] font-bold text-branco transition-colors group-hover:bg-azul-petroleo">
                        Editar
                      </span>
                    </button>
                  ) : (
                    dataBR(l.data)
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.totalFormasPagamento)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.salao)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.deliveryProprio)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.ifood)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.food99)}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-azul-noite">
                  {brl(l.faturamentoTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(l.totalCanais)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.diferenca > 0 ? brl(l.diferenca) : "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      l.status === "divergente" ? "bg-vermelho/10 text-vermelho" : "bg-verde/10 text-verde"
                    }`}
                  >
                    {l.status === "divergente" ? "Com divergência" : "Conferido"}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{l.atualizadoPorNome ?? l.criadoPorNome}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-cinza-medio">{dataHoraBR(l.atualizadoEm)}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={totalColunas} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum lançamento com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}
