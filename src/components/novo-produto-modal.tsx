"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NovoProdutoForm } from "@/components/novo-produto-form";
import type { Produto } from "@/lib/types";
import { ModalFlutuante } from "@/components/modal-flutuante";

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
        <ModalFlutuante aberto onFechar={fechar}>
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
        </ModalFlutuante>
      )}
    </>
  );
}
