"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirFichaTecnicaAction } from "@/app/(app)/fichas-tecnicas/actions";

/** Confirmação em duas etapas (sem modal/confirm nativo) - primeiro toque
 * troca o botão por "Confirmar exclusão"/"Cancelar", só o segundo toque
 * exclui de verdade. `aoExcluir` opcional: sem ele (uso na rota
 * `/fichas-tecnicas/[id]`) navega de volta pra listagem; dentro da janela
 * sobreposta, quem chama decide (fechar a janela). */
export function ExcluirFichaTecnicaBotao({ id, aoExcluir }: { id: string; aoExcluir?: () => void }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function excluir() {
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirFichaTecnicaAction(id);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        setConfirmando(false);
        return;
      }
      if (aoExcluir) {
        aoExcluir();
        return;
      }
      router.push("/fichas-tecnicas");
      router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="shrink-0 rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho"
      >
        Excluir
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="shrink-0 rounded-md bg-vermelho px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
        >
          {isPending ? "Excluindo..." : "Confirmar exclusão"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="shrink-0 rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="max-w-[200px] text-right text-xs text-vermelho">{erro}</p>}
    </div>
  );
}
