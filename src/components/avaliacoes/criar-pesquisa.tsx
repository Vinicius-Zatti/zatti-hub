"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarPesquisaAction } from "@/app/(app)/avaliacoes/actions";

/** Primeiro passo do módulo: cria a pesquisa da unidade com as perguntas prontas. */
export function CriarPesquisa({ unidadeNome, podeEditar }: { unidadeNome: string; podeEditar: boolean }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-5">
      <h2 className="font-display text-lg font-bold text-azul-noite">A pesquisa da {unidadeNome} ainda não foi criada</h2>
      <p className="text-sm text-cinza">
        Ela nasce com as perguntas prontas (atendimento, comida, tempo de espera, se indicaria, como conheceu e comentário) e com o nome da unidade. Depois você
        coloca a logo e as cores, liga ou desliga perguntas e baixa a arte do QR para imprimir.
      </p>
      {podeEditar ? (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await criarPesquisaAction();
              if ("erro" in r) setErro(r.erro);
              else router.refresh();
            })
          }
          className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
        >
          {pendente ? "Criando..." : `Criar a pesquisa da ${unidadeNome} com as perguntas prontas`}
        </button>
      ) : (
        <p className="text-sm text-cinza-medio">Seu acesso às Avaliações é só para ver. Peça a quem administra a equipe para criar.</p>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
    </div>
  );
}
