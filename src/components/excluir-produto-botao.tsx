"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirProdutoAction } from "@/app/(app)/estoque/produtos/actions";

/** Confirmação em duas etapas com o aviso pedido explícito, igual
 * `ExcluirFichaTecnicaBotao` - mas aqui o aviso também avisa sobre o
 * componente de Ficha Técnica que vai junto (exclusão em cascata, não
 * bloqueio - diferente de excluir uma ficha técnica). */
export function ExcluirProdutoBotao({ sku }: { sku: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function excluir() {
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirProdutoAction(sku);
      if ("erro" in resultado) {
        setErro(resultado.erro);
        setConfirmando(false);
        return;
      }
      router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-md border border-vermelho px-2 py-1 text-[10px] font-semibold text-vermelho"
      >
        Excluir
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <p className="max-w-[160px] text-[10px] text-cinza-medio">
        Tem certeza que deseja excluir esse item? Se ele estiver relacionado a alguma Ficha Técnica, ele também será
        excluído da F.T.
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="rounded-md bg-vermelho px-2 py-1 text-[10px] font-semibold text-branco disabled:opacity-50"
        >
          {isPending ? "Excluindo..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-md border border-cinza-claro px-2 py-1 text-[10px] font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="max-w-[160px] text-[10px] text-vermelho">{erro}</p>}
    </div>
  );
}
