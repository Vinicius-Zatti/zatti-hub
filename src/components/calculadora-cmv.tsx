"use client";

import { useMemo, useState } from "react";
import type { ItemInventario, Pedido } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import { CampoNumero } from "@/components/campo-numero";
import { calcularCmv, datasDeContagem } from "@/lib/cmv";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CalculadoraCmv({
  itensInventario,
  pedidos,
}: {
  itensInventario: ItemInventario[];
  pedidos: Pedido[];
}) {
  const datas = useMemo(() => datasDeContagem(itensInventario), [itensInventario]);

  const [dataInicial, setDataInicial] = useState(datas[1] ?? datas[0] ?? "");
  const [dataFinal, setDataFinal] = useState(datas[0] ?? "");
  const [faturamento, setFaturamento] = useState<number | null>(null);

  const resultado = useMemo(() => {
    if (!dataInicial || !dataFinal) return null;
    return calcularCmv({ itensInventario, pedidos, dataInicial, dataFinal, faturamento });
  }, [itensInventario, pedidos, dataInicial, dataFinal, faturamento]);

  if (datas.length < 2) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-bold text-azul-noite">CMV Real</h1>
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
          Precisa de pelo menos 2 contagens registradas (uma no início do período, outra no fim) pra
          calcular o CMV. Registre a contagem em Estoque {">"} Contagem primeiro.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">CMV Real</h1>
        <p className="text-sm text-cinza-medio">
          Calculado a partir do estoque contado, das compras recebidas e do faturamento do período.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-cinza-claro bg-branco p-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Contagem inicial (início do período)
          <select
            value={dataInicial}
            onChange={(e) => setDataInicial(e.target.value)}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
          >
            {datas.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Contagem final (fim do período)
          <select
            value={dataFinal}
            onChange={(e) => setDataFinal(e.target.value)}
            className="rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none"
          >
            {datas.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Faturamento do período (R$)
          <CampoNumero value={faturamento} onChange={setFaturamento} className="w-36" />
        </label>
      </div>

      {resultado && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Estoque inicial" value={formatMoeda(resultado.valorEstoqueInicial)} />
            <StatCard label="Compras recebidas no período" value={formatMoeda(resultado.valorCompras)} />
            <StatCard label="Estoque final" value={formatMoeda(resultado.valorEstoqueFinal)} />
            <StatCard label="Custo consumido" value={formatMoeda(resultado.custoConsumido)} tone="ambar" />
            <StatCard label="Faturamento informado" value={formatMoeda(resultado.faturamento)} />
            <StatCard
              label="CMV real do período"
              value={resultado.cmvPercentual !== null ? `${resultado.cmvPercentual.toFixed(1)}%` : "informe o faturamento"}
              tone="ambar"
            />
          </div>
          <p className="text-xs text-cinza-medio">
            Custo consumido = estoque inicial + compras recebidas no período − estoque final. CMV real =
            custo consumido ÷ faturamento informado. Compras recebidas consideram a data em que o pedido
            foi marcado como recebido em Pedidos Feitos.
          </p>
        </>
      )}
    </div>
  );
}
