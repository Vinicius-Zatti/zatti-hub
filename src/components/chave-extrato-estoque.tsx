"use client";

import { useState, useTransition } from "react";
import { definirExtratoEstoqueAction } from "@/app/(app)/acessos/actions";

/** Chave "Usar extrato do estoque" de uma unidade, no Painel de Acessos (só
 * master chega aqui; a barreira real é `requireMaster()` na action). O rótulo
 * do botão diz o efeito. Unidade na planilha não tem extrato, então não tem botão. */
export function ChaveExtratoEstoque({
  unidadeId,
  ligada,
  temEstoqueNoBanco,
}: {
  unidadeId: string;
  ligada: boolean;
  temEstoqueNoBanco: boolean;
}) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar() {
    setErro(null);
    startTransition(async () => {
      const r = await definirExtratoEstoqueAction(unidadeId, !ligada);
      if ("erro" in r) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ligada ? "bg-verde/10 text-verde" : "bg-cinza-claro text-cinza-medio"}`}
      >
        {ligada ? "Ligado" : "Desligado"}
      </span>
      {temEstoqueNoBanco && (
        <button
          type="button"
          disabled={pendente}
          onClick={alternar}
          className={`rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
            ligada
              ? "border-vermelho text-vermelho hover:bg-vermelho/10"
              : "border-azul-petroleo text-azul-petroleo hover:bg-azul-petroleo/10"
          }`}
        >
          {pendente ? "Salvando..." : ligada ? "Desligar extrato do estoque" : "Ligar extrato do estoque"}
        </button>
      )}
      {erro && <p className="text-xs text-vermelho">{erro}</p>}
    </div>
  );
}
