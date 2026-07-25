"use client";

import { useState } from "react";
import type { Pedido } from "@/lib/types";
import { Th } from "@/components/tabela";
import { marcarRecebidoAction } from "@/app/(app)/estoque/pedidos/feitos/actions";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Histórico dos Pedidos de Compra já salvos no Editor de Espelhos. Gestão
 * edita a quantidade recebida item a item (pode vir diferente do pedido);
 * Operacional só marca recebido e escreve a observação - nunca mexe em
 * quantidade, fornecedor ou preço (`podeEditarQuantidade=false` some com os
 * campos, e a Server Action por trás também não aceita mais que isso). */
export function PedidosFeitos({
  pedidos,
  podeEditarQuantidade,
}: {
  pedidos: Pedido[];
  podeEditarQuantidade: boolean;
}) {
  const [quantidadesRecebidas, setQuantidadesRecebidas] = useState<Record<string, Record<string, number | null>>>(
    () =>
      Object.fromEntries(
        pedidos.map((p) => [
          p.id,
          Object.fromEntries(p.itens.map((it) => [it.sku, it.quantidadeRecebida ?? it.quantidadePedida])),
        ])
      )
  );
  const [observacoes, setObservacoes] = useState<Record<string, string>>(() =>
    Object.fromEntries(pedidos.map((p) => [p.id, p.observacaoEntrega ?? ""]))
  );
  const [recebido, setRecebido] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pedidos.map((p) => [p.id, p.recebido]))
  );
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, string>>({});

  async function salvar(pedido: Pedido) {
    setSalvando((s) => ({ ...s, [pedido.id]: true }));
    const resultado = await marcarRecebidoAction({
      pedidoId: pedido.id,
      recebido: recebido[pedido.id] ?? false,
      observacaoEntrega: observacoes[pedido.id]?.trim() || null,
      itensRecebidos: podeEditarQuantidade
        ? pedido.itens.map((it) => ({
            sku: it.sku,
            quantidadeRecebida: quantidadesRecebidas[pedido.id]?.[it.sku] ?? null,
          }))
        : [],
    });
    setSalvando((s) => ({ ...s, [pedido.id]: false }));
    setStatus((s) => ({ ...s, [pedido.id]: "erro" in resultado ? resultado.erro : "Salvo." }));
    setTimeout(() => setStatus((s) => ({ ...s, [pedido.id]: "" })), 4000);
  }

  if (pedidos.length === 0) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
        Nenhum pedido salvo ainda. Fecha um no Editor de Espelhos de Compras primeiro.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      {pedidos.map((pedido) => {
        const total = pedido.itens.reduce((soma, it) => {
          if (it.precoAtualizado === null) return soma;
          return soma + it.quantidadePedida * it.precoAtualizado;
        }, 0);

        return (
          <div key={pedido.id} className="rounded-lg border border-cinza-claro bg-branco">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cinza-claro bg-azul-noite px-4 py-2.5">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-branco">{pedido.fornecedor}</span>
                <span className="text-[11px] text-cinza-claro">
                  Contagem base {pedido.dataContagemBase}
                  {pedido.previsaoEntrega && ` · entrega prevista ${formatData(pedido.previsaoEntrega)}`}
                </span>
              </div>
              <span className="text-xs font-semibold text-cinza-claro">{formatMoeda(total)}</span>
            </div>

            <div className="max-h-[45vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-off-white text-cinza-medio">
                    <Th>Item</Th>
                    <Th align="right">Qtd. pedida</Th>
                    <Th align="right">Qtd. recebida</Th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map((item) => (
                    <tr key={item.sku} className="border-t border-cinza-claro">
                      <td className="px-3 py-2 font-medium text-cinza">{item.nome}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                        {item.quantidadePedida} {item.unidadeBase}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {podeEditarQuantidade ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={quantidadesRecebidas[pedido.id]?.[item.sku] ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.replace(",", ".");
                              const num = raw === "" ? null : Number(raw);
                              if (num === null || !Number.isNaN(num)) {
                                setQuantidadesRecebidas((q) => ({
                                  ...q,
                                  [pedido.id]: { ...q[pedido.id], [item.sku]: num },
                                }));
                              }
                            }}
                            className="w-16 rounded border border-cinza-claro px-1.5 py-1 text-right focus:border-ambar focus:outline-none"
                          />
                        ) : (
                          <span className="tabular-nums text-cinza-medio">
                            {item.quantidadeRecebida ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-cinza-claro px-4 py-3">
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Observação da entrega
                <textarea
                  value={observacoes[pedido.id] ?? ""}
                  onChange={(e) => setObservacoes((o) => ({ ...o, [pedido.id]: e.target.value }))}
                  rows={2}
                  className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
                  placeholder="Ex: faltou 1 caixa de coca, fornecedor repõe na quinta"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-cinza-medio">
                <input
                  type="checkbox"
                  checked={recebido[pedido.id] ?? false}
                  onChange={(e) => setRecebido((r) => ({ ...r, [pedido.id]: e.target.checked }))}
                />
                Pedido recebido
              </label>
              <button
                type="button"
                onClick={() => salvar(pedido)}
                disabled={salvando[pedido.id]}
                className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:bg-[#b07720] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {salvando[pedido.id] ? "Salvando..." : "Salvar"}
              </button>
            </div>
            {status[pedido.id] && (
              <div className="border-t border-cinza-claro px-4 py-2 text-xs text-cinza-medio">
                {status[pedido.id]}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
