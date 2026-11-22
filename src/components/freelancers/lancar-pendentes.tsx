"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lancarPendentesAction } from "@/app/(app)/freelancers/actions";

/** Diárias conferidas que ficaram sem título (Financeiro desligado, mês fechado, sem conta do
 * caixa): tenta lançar de novo depois que o motivo foi resolvido. */
export function LancarPendentes({ quantidade }: { quantidade: number }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ambar/40 bg-ambar/10 p-3">
      <p className="text-sm text-azul-noite">
        {quantidade === 1 ? "1 diária conferida ainda não está" : `${quantidade} diárias conferidas ainda não estão`} no Contas a Pagar. O motivo aparece na
        coluna Contas a Pagar de cada uma.
      </p>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await lancarPendentesAction();
            if ("erro" in r) setErro(r.erro);
            router.refresh();
          })
        }
        className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
      >
        {pendente ? "Tentando..." : "Já resolvi o motivo: tentar lançar no Contas a Pagar de novo"}
      </button>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
    </div>
  );
}
