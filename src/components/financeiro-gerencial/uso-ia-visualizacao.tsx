"use client";

import Link from "next/link";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaCalculo } from "@/components/dica-calculo";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { EXPLICACAO_CUSTO_IA } from "@/lib/conciliacao/ia-custo";
import type { Semana } from "@/lib/conciliacao/uso-ia";

function usd(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function UsoIaVisualizacao({ semanas }: { semanas: Semana[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Uso de IA na Conciliação</h1>
          <p className="text-sm text-cinza-medio">
            Total por semana (segunda a domingo), somando todas as unidades. O mesmo total da semana anterior chega toda segunda-feira pelo Vini.
          </p>
        </div>
        <Link href="/financeiro-gerencial/conciliacao" className="shrink-0 text-xs font-semibold text-azul-petroleo underline">Voltar</Link>
      </div>
      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Custo de IA por semana">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Semana</Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1">
                  Custo estimado <DicaCalculo texto={EXPLICACAO_CUSTO_IA} rotulo="Custo estimado" />
                </span>
              </Th>
              <Th align="right">Chamadas</Th>
              <Th align="right">Sem custo conhecido</Th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => (
              <tr key={s.inicio} className="border-t border-cinza-claro">
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatarDataBr(s.inicio)} a {formatarDataBr(s.fim)}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{usd(s.custoUsd)}</td>
                <td className="px-3 py-2 text-right">{s.chamadas}</td>
                <td className="px-3 py-2 text-right">{s.semCustoConhecido}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
      <p className="text-xs text-cinza-medio">
        Valor em dólar porque é assim que a Anthropic cobra. A fatura oficial fica no console da Anthropic; aqui é a estimativa pelo uso que cada resposta informa.
      </p>
    </div>
  );
}
