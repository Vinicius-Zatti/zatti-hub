"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaCalculo } from "@/components/dica-calculo";
import { decidirPrecoRascunhoFichaAction } from "@/app/(app)/fichas-tecnicas/actions";

export type RascunhoPrecoChef = {
  fichaId: string;
  nome: string;
  sku: string;
  precoAtual: number | null;
  rascunho: number;
  custoPorUnidade: number | null;
};

function brl(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cmv(custo: number | null, preco: number | null): string {
  if (custo === null || preco === null || preco <= 0) return "-";
  return `${((custo / preco) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Preços sugeridos pelo chef esperando a gestão (26/10/2026). Aceitar troca o preço do Salão
 * pelo sugerido; descartar apaga a sugestão. Some quando não há nenhum. */
export function RascunhosPrecoChef({ rascunhos }: { rascunhos: RascunhoPrecoChef[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  if (rascunhos.length === 0) return null;

  function decidir(r: RascunhoPrecoChef, decisao: "aceitar" | "descartar") {
    setErro(null);
    startTransition(async () => {
      const resultado = await decidirPrecoRascunhoFichaAction(r.fichaId, decisao, r.rascunho);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1 font-display text-lg font-bold text-azul-noite">
        Preços sugeridos pelo chef ({rascunhos.length})
        <DicaCalculo
          rotulo="CMV com o preço sugerido"
          texto="CMV = custo dos insumos por unidade dividido pelo preço, vezes 100. A coluna mostra o CMV com o preço atual e com o sugerido."
        />
      </h2>
      <p className="text-xs text-cinza-medio">
        O preço de venda só muda quando você aceita. Aceitar troca o preço do Salão pelo sugerido.
      </p>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <TabelaRolavel className="max-h-[40vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Preços sugeridos pelo chef">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th fixo>Ficha</Th>
              <Th align="right">Preço atual</Th>
              <Th align="right">Sugerido</Th>
              <Th align="right">CMV atual</Th>
              <Th align="right">CMV sugerido</Th>
              <Th align="right">Decisão</Th>
            </tr>
          </thead>
          <tbody>
            {rascunhos.map((r) => (
              <tr key={r.fichaId} className="border-b border-cinza-claro last:border-0">
                <td className="max-w-[200px] px-3 py-1.5 font-medium text-cinza">
                  <div className="truncate" title={r.nome}>
                    {r.nome}
                  </div>
                  <div className="truncate text-[10px] text-cinza-medio">{r.sku}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-cinza-medio">{brl(r.precoAtual)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-ambar">{brl(r.rascunho)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-cinza-medio">{cmv(r.custoPorUnidade, r.precoAtual)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-azul-noite">
                  {cmv(r.custoPorUnidade, r.rascunho)}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => decidir(r, "aceitar")}
                      className="whitespace-nowrap rounded-md bg-verde px-2 py-1 text-xs font-semibold text-branco disabled:opacity-50"
                    >
                      Usar {brl(r.rascunho)} no Salão
                    </button>
                    <button
                      type="button"
                      disabled={pendente}
                      onClick={() => decidir(r, "descartar")}
                      className="whitespace-nowrap rounded-md border border-vermelho px-2 py-1 text-xs font-semibold text-vermelho disabled:opacity-50"
                    >
                      Descartar sugestão
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </section>
  );
}
