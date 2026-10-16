"use client";

import { useState } from "react";
import { QuadroOperacao } from "@/components/operacao/quadro-operacao";
import { TarefasClientes } from "@/components/operacao/tarefas-clientes";
import { dataHoraBr } from "@/lib/operacao/quadro";
import type { LeituraOperacao } from "@/lib/operacao/tipos";

const ABAS = [
  { id: "quadro", rotulo: "Quadro" },
  { id: "tarefas", rotulo: "Tarefas dos clientes" },
] as const;

/** Painel de operação (16/10/2026): tudo o que vive no WhatsApp do Vini num
 * quadro só. O Vini é dono dos dados; fora do ar, a tela avisa e não quebra. */
export function PainelOperacao({
  dados,
  aviso,
  ignorados,
  hoje,
}: {
  dados: LeituraOperacao | null;
  aviso: string | null;
  ignorados: number;
  hoje: string;
}) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("quadro");

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Operação</h1>
        <p className="text-sm text-cinza">
          Demandas, atas, pautas, ações e alertas do Vini, e as tarefas que saíram das atas. O que mudar aqui vale também no WhatsApp.
        </p>
        {dados?.geradoEm && <p className="text-xs text-cinza-medio">Lido do Vini em {dataHoraBr(dados.geradoEm)}.</p>}
      </div>

      {aviso && (
        <p role="alert" className="rounded-lg border border-ambar bg-ambar/10 px-3 py-2 text-sm text-azul-noite">
          {aviso}
        </p>
      )}
      {ignorados > 0 && (
        <p className="rounded-lg border border-cinza-claro bg-branco px-3 py-2 text-xs text-cinza-medio">
          {ignorados} registro{ignorados === 1 ? "" : "s"} do Vini veio fora do formato e ficou de fora. Isso é um erro do app, não da operação.
        </p>
      )}

      {dados && (
        <>
          <div role="tablist" aria-label="Abas da operação" className="flex gap-1 self-start rounded-lg border border-cinza-claro bg-branco p-1">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${aba === a.id ? "bg-azul-noite text-branco" : "text-cinza-medio hover:text-azul-noite"}`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          {aba === "quadro" ? <QuadroOperacao itens={dados.itens} hoje={hoje} /> : <TarefasClientes tarefas={dados.tarefas} hoje={hoje} />}
        </>
      )}
    </div>
  );
}
