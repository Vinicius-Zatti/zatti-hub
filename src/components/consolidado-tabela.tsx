"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ConsolidadoVenda } from "@/lib/types";
import { Th } from "@/components/tabela";

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

/** Histórico de fechamentos diários, com filtro por período e status - mesmo
 * padrão de tabela de `visualizacao-contagens.tsx` (busca tudo uma vez do
 * servidor, filtra em memória no cliente). */
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
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [status, setStatus] = useState<FiltroStatus>(
    statusInicial === "conferido" || statusInicial === "divergente" ? statusInicial : "todos"
  );

  const filtrados = useMemo(() => {
    return lancamentos
      .filter((l) => !de || l.data >= de)
      .filter((l) => !ate || l.data <= ate)
      .filter((l) => status === "todos" || l.status === status)
      .sort((a, b) => (a.data < b.data ? 1 : -1));
  }, [lancamentos, de, ate, status]);

  const divergentesNoFiltro = filtrados.filter((l) => l.status === "divergente").length;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Consolidado de Vendas</h1>
        <p className="text-sm text-cinza-medio">Histórico dos fechamentos diários já registrados.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          De
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Até
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm focus:border-ambar focus:outline-none"
          />
        </label>
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

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro bg-branco">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Data</Th>
              <Th align="right">Total formas de pagamento</Th>
              <Th align="right">Salão</Th>
              <Th align="right">Delivery próprio</Th>
              <Th align="right">Total canais</Th>
              <Th align="right">Diferença</Th>
              <Th>Status</Th>
              <Th>Responsável</Th>
              <Th>Última atualização</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((l, i) => {
              const linhaClasse = `border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""} ${
                podeEditar ? "cursor-pointer hover:bg-ambar/5" : ""
              }`;

              return (
                <tr
                  key={l.id}
                  className={linhaClasse}
                  onClick={podeEditar ? () => router.push(`/financeiro/consolidado/${l.id}/editar`) : undefined}
                >
                  <td className="px-3 py-2 whitespace-nowrap font-medium text-cinza">{dataBR(l.data)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(l.totalFormasPagamento)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(l.salao)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(l.deliveryProprio)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(l.totalCanais)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.diferenca > 0 ? brl(l.diferenca) : "—"}
                  </td>
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
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-cinza-medio">
                    {dataHoraBR(l.atualizadoEm)}
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum lançamento com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
