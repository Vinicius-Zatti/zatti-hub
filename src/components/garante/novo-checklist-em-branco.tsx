"use client";

import { useState } from "react";
import { criarModeloAction } from "@/app/(app)/garante/actions";
import { ModalFlutuante } from "@/components/modal-flutuante";

/** Cartão "Checklist em branco": o nome se digita no modal padrão. */
export function NovoChecklistEmBranco() {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-cinza-claro bg-branco p-4">
      <span className="font-semibold text-azul-noite">Checklist em branco</span>
      <span className="text-xs text-cinza-medio">Para uma rotina que não está nos POPs. Você monta os itens um a um.</span>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco"
      >
        Criar checklist em branco
      </button>
      <ModalFlutuante aberto={aberto} onFechar={() => setAberto(false)}>
        <form action={criarModeloAction} className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Novo checklist em branco</h2>
          <label className="text-xs font-semibold text-cinza-medio">
            Nome do checklist
            <input name="nome" required maxLength={120} autoFocus className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm" />
          </label>
          <p className="text-xs text-cinza-medio">Depois de criar, você adiciona os itens e publica para quem vai fazer.</p>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-azul-noite px-3 py-2 text-xs font-semibold text-branco">
              Criar
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
              Cancelar
            </button>
          </div>
        </form>
      </ModalFlutuante>
    </div>
  );
}
