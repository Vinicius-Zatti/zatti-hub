"use client";

import { useEffect } from "react";
import { ErroCarregamento } from "@/components/erro-carregamento";
import { identificadorDoErro } from "@/lib/suporte";

// Corpo único dos `error.tsx` do app (Financeiro, Estoque, Painel...): qualquer
// leitura que falhe - inclusive no meio da paginação - cai aqui. A tela não
// fica em branco nem mostra número parcial, e as abas do segmento continuam no
// lugar (o layout fica fora do limite).
export default function LimiteErroCarregamento({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Só o digest do Next ou uma mensagem pública: nunca a mensagem crua.
  const identificador = identificadorDoErro(error);

  return (
    <ErroCarregamento identificador={identificador}>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border border-azul-petroleo px-3 py-1 text-xs font-bold text-azul-petroleo"
      >
        Tentar de novo
      </button>
    </ErroCarregamento>
  );
}
