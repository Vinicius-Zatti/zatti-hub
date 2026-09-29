"use client";

import { useEffect } from "react";
import { ErroCarregamento } from "@/components/erro-carregamento";

// Qualquer leitura do Financeiro Gerencial que falhe (inclusive no meio da
// paginação) cai aqui: a tela não fica em branco nem mostra número parcial.
// As abas do Financeiro continuam no lugar (o layout fica fora do limite).
export default function ErroFinanceiroGerencial({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErroCarregamento>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-4 rounded-md border border-azul-petroleo px-3 py-1 text-xs font-bold text-azul-petroleo"
      >
        Tentar de novo
      </button>
    </ErroCarregamento>
  );
}
