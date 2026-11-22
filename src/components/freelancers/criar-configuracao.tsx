"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarConfiguracaoAction } from "@/app/(app)/freelancers/actions";

/** Primeiro passo do módulo: cria o endereço fixo do QR Code da unidade. */
export function CriarConfiguracao({ unidadeNome, podeEditar }: { unidadeNome: string; podeEditar: boolean }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-5">
      <h2 className="font-display text-lg font-bold text-azul-noite">O QR Code de check-in da {unidadeNome} ainda não foi criado</h2>
      <p className="text-sm text-cinza">
        O freelancer lê o QR Code na loja, confirma o WhatsApp e pronto: aparece aqui para você conferir. Quem ainda não tem cadastro entra como novo e você
        aprova na conferência. Depois de criar, imprima a arte do QR e coloque perto da entrada da equipe.
      </p>
      {podeEditar ? (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await criarConfiguracaoAction();
              if ("erro" in r) setErro(r.erro);
              else router.refresh();
            })
          }
          className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
        >
          {pendente ? "Criando..." : `Criar o QR Code de check-in da ${unidadeNome}`}
        </button>
      ) : (
        <p className="text-sm text-cinza-medio">Seu acesso aos Freelancers é só para ver. Peça a quem administra a equipe para criar.</p>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
    </div>
  );
}
