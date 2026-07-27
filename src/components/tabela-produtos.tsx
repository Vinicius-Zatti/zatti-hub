"use client";

import type { Produto } from "@/lib/types";
import { Th } from "@/components/tabela";
import { useTabelaExpansivel } from "@/components/use-tabela-expansivel";
import { BotaoExpandir } from "@/components/botao-expandir";
import { formatarQuantidade } from "@/lib/unidades";

function formatMoeda(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TabelaProdutos({ produtos }: { produtos: Produto[] }) {
  const { expandido, alternar } = useTabelaExpansivel();

  return (
    <div className={expandido ? "fixed inset-0 z-40 flex flex-col gap-2 bg-branco p-3" : ""}>
      <div className="flex items-center justify-end">
        <BotaoExpandir expandido={expandido} onClick={alternar} />
      </div>
      <div
        className={`${expandido ? "min-h-0 flex-1" : "max-h-[70vh]"} overflow-auto rounded-lg border border-cinza-claro bg-branco`}
      >
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>SKU</Th>
              <Th>Grupo</Th>
              <Th fixo>Nome</Th>
              <Th>Unidade</Th>
              <Th align="right">Preço</Th>
              <Th align="right">Estoque Pra Semana</Th>
              <Th align="center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p, i) => (
              <tr
                key={p.sku}
                className={`border-t border-cinza-claro ${i % 2 === 1 ? "bg-off-white/60" : ""}`}
              >
                <td className="px-3 py-2 font-mono text-xs text-cinza-medio">{p.sku}</td>
                <td className="px-3 py-2">{p.grupo}</td>
                <td
                  className={`sticky left-0 z-10 px-3 py-2 font-medium text-cinza ${
                    i % 2 === 1 ? "bg-off-white" : "bg-branco"
                  }`}
                >
                  {p.nome}
                </td>
                <td className="px-3 py-2">{p.unidadeBase}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoeda(p.precoUnitario)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarQuantidade(p.estoqueNecessarioSemana, p.unidadeBase)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.ativo ? "bg-verde/10 text-verde" : "bg-cinza-claro text-cinza-medio"
                    }`}
                  >
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum produto cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
