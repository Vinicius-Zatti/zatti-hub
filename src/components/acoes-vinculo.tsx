"use client";

import { useState, useTransition } from "react";
import {
  reativarVinculoAction,
  reenviarAcessoAction,
  revogarVinculoAction,
} from "@/app/(app)/acessos/actions";

export function AcoesVinculo({
  vinculoId,
  userId,
  status,
}: {
  vinculoId: string;
  userId: string;
  status: string;
}) {
  const [pendente, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function rodar(acao: () => Promise<{ ok: true } | { erro: string } | { ok: true; tipo: string }>) {
    setMensagem(null);
    startTransition(async () => {
      const r = await acao();
      if ("erro" in r) {
        setMensagem({ tipo: "erro", texto: r.erro });
        return;
      }
      const texto =
        "tipo" in r
          ? r.tipo === "convite"
            ? "Convite reenviado."
            : "Link de recuperação de senha enviado."
          : "Feito.";
      setMensagem({ tipo: "ok", texto });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar(() => reenviarAcessoAction(userId))}
          className="rounded-md border border-azul-petroleo px-2 py-1 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40"
        >
          Reenviar acesso
        </button>
        {status === "ativo" ? (
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => revogarVinculoAction(vinculoId))}
            className="rounded-md border border-vermelho px-2 py-1 text-xs font-semibold text-vermelho hover:bg-vermelho/10 disabled:opacity-40"
          >
            Revogar
          </button>
        ) : (
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => reativarVinculoAction(vinculoId))}
            className="rounded-md border border-verde px-2 py-1 text-xs font-semibold text-verde hover:bg-verde/10 disabled:opacity-40"
          >
            Reativar
          </button>
        )}
      </div>
      {mensagem && (
        <p className={`text-xs ${mensagem.tipo === "erro" ? "text-vermelho" : "text-verde"}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
