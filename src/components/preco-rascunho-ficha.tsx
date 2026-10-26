"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { salvarPrecoRascunhoFichaAction } from "@/app/(app)/fichas-tecnicas/actions";

function brl(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Preço de venda sugerido pelo chef (26/10/2026). Fica como rascunho até a gestão aceitar na
 * Precificação; o preço oficial não muda por aqui. O chef vê o CMV com o preço sugerido. */
export function PrecoRascunhoFicha({
  fichaId,
  custoPorUnidade,
  rascunhoInicial,
}: {
  fichaId: string;
  custoPorUnidade: number | null;
  rascunhoInicial: number | null;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<number | null>(rascunhoInicial);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const mudou = valor !== rascunhoInicial;
  const cmv = custoPorUnidade !== null && valor !== null && valor > 0 ? (custoPorUnidade / valor) * 100 : null;

  function salvar() {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const r = await salvarPrecoRascunhoFichaAction(fichaId, valor);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setSalvo(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-ambar/60 bg-ambar/5 p-4">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ambar">Preço sugerido (rascunho)</div>
      <p className="mb-3 text-xs text-cinza-medio">
        A gestão confere e aprova na Precificação. Até lá, o preço de venda oficial continua o mesmo.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Preço de venda sugerido - Salão
        <CampoNumero
          value={valor}
          onChange={(v) => {
            setValor(v);
            setSalvo(false);
          }}
        />
      </label>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 text-cinza-medio">
          CMV com o preço sugerido
          <DicaCalculo
            rotulo="CMV com o preço sugerido"
            texto={`Custo dos insumos por unidade (${brl(custoPorUnidade)}) dividido pelo preço sugerido, vezes 100.`}
          />
        </span>
        <span className="font-semibold text-azul-noite">
          {cmv === null ? "-" : `${cmv.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
        </span>
      </div>
      {erro && <p className="mt-2 text-sm text-vermelho">{erro}</p>}
      <button
        type="button"
        onClick={salvar}
        disabled={!mudou || pendente}
        className="mt-3 w-full rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
      >
        {pendente
          ? "Salvando..."
          : salvo
            ? "Sugestão enviada para a gestão"
            : valor === null
              ? "Apagar a sugestão de preço"
              : `Sugerir ${brl(valor)} para a gestão aprovar`}
      </button>
    </div>
  );
}
