"use client";

import { useState, useTransition } from "react";
import { atualizarNomeUsuarioAction } from "@/app/(app)/acessos/actions";

/** Nome clicável na listagem de Usuários e vínculos - vira campo de texto
 * editável no lugar, sem modal nem navegar pra outra tela. Único ponto do
 * painel onde dá pra corrigir o nome de um usuário já convidado (antes só
 * dava pra definir no momento do convite). */
export function EditarNomeVinculo({ userId, nomeAtual }: { userId: string; nomeAtual: string | null }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nomeAtual ?? "");
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await atualizarNomeUsuarioAction(userId, valor);
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      setEditando(false);
    });
  }

  function cancelar() {
    setValor(nomeAtual ?? "");
    setErro(null);
    setEditando(false);
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="text-left font-medium text-azul-noite hover:underline"
        title="Editar nome"
      >
        {nomeAtual || <span className="font-normal italic text-cinza-medio">sem nome - clique pra definir</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") cancelar();
          }}
          disabled={pendente}
          className="w-full min-w-[140px] rounded-md border border-cinza-claro px-2 py-1 text-sm text-cinza focus:border-ambar focus:outline-none"
        />
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="shrink-0 rounded-md bg-azul-noite px-2 py-1 text-xs font-semibold text-branco disabled:opacity-50"
        >
          {pendente ? "..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={cancelar}
          disabled={pendente}
          className="shrink-0 rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-cinza-medio disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="text-xs text-vermelho">{erro}</p>}
    </div>
  );
}
