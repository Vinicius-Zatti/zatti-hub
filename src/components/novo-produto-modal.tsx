"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NovoProdutoForm } from "@/components/novo-produto-form";
import type { Produto } from "@/lib/types";

export function NovoProdutoModal({
  label = "+ Novo produto",
  className = "shrink-0 rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo",
  onCriado,
}: {
  label?: string;
  className?: string;
  /** Quando informado (ex: dentro da Edição de Dados), o produto criado entra
   * direto na lista local do chamador em vez de recarregar a página. */
  onCriado?: (produto: Produto) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  function fechar() {
    setAberto(false);
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className}>
        {label}
      </button>
      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-azul-noite/60 sm:items-center sm:p-4"
          onClick={fechar}
        >
          <div
            className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-off-white p-4 sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <NovoProdutoForm
              onSalvo={(produto) => {
                fechar();
                if (onCriado) {
                  onCriado(produto);
                } else {
                  router.refresh();
                }
              }}
              onCancelar={fechar}
            />
          </div>
        </div>
      )}
    </>
  );
}
