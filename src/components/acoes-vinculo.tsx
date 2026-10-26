"use client";

import { useState, useTransition } from "react";
import {
  reativarVinculoAction,
  reenviarAcessoAction,
  revogarVinculoAction,
} from "@/app/(app)/acessos/actions";
import { GerarSenhaProvisoria } from "@/components/gerar-senha-provisoria";
import { EditarAcesso } from "@/components/editar-acesso";

export function AcoesVinculo({
  vinculoId,
  userId,
  status,
  nomeExibido,
  whatsappFinal,
  podeGerarProvisoria,
  edicao,
  layout = "tabela",
}: {
  vinculoId: string;
  userId: string;
  status: string;
  nomeExibido: string;
  whatsappFinal: string | null;
  podeGerarProvisoria: boolean;
  /** Editar papel e unidade sem revogar (24/10/2026); nulo = sem o botão. */
  edicao: {
    role: "gestao" | "operacional";
    unidadeId: string | null;
    unidades: { id: string; nome: string }[];
    organizacaoNome: string;
  } | null;
  /** "cartao" (celular, 26/10/2026): botões alinhados à esquerda, sem quebrar
   * palavra, área de toque maior e Revogar/Reativar separado à direita. */
  layout?: "tabela" | "cartao";
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

  const cartao = layout === "cartao";
  // Mesmas cores e textos nos dois layouts; o cartão só muda tamanho e alinhamento.
  const base = cartao
    ? "whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
    : "rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-40";

  const botaoSituacao =
    status === "ativo" ? (
      <button
        type="button"
        disabled={pendente}
        onClick={() => rodar(() => revogarVinculoAction(vinculoId))}
        className={`${base} border-vermelho text-vermelho hover:bg-vermelho/10`}
      >
        Revogar
      </button>
    ) : (
      <button
        type="button"
        disabled={pendente}
        onClick={() => rodar(() => reativarVinculoAction(vinculoId))}
        className={`${base} border-verde text-verde hover:bg-verde/10`}
      >
        Reativar
      </button>
    );

  return (
    <div className={`flex flex-col gap-1 ${cartao ? "items-stretch" : "items-end"}`}>
      <div className={`flex flex-wrap gap-2 ${cartao ? "items-center" : "justify-end"}`}>
        {podeGerarProvisoria && (
          <GerarSenhaProvisoria
            modo="master"
            vinculoId={vinculoId}
            nomeExibido={nomeExibido}
            whatsappFinal={whatsappFinal}
            className={`${base} border-ambar text-ambar hover:bg-ambar/10`}
          />
        )}
        <button
          type="button"
          disabled={pendente}
          onClick={() => rodar(() => reenviarAcessoAction(userId))}
          className={`${base} border-azul-petroleo text-azul-petroleo hover:bg-azul-petroleo/10`}
        >
          Reenviar acesso
        </button>
        {edicao && (
          <EditarAcesso
            modo="master"
            vinculoId={vinculoId}
            nomeExibido={nomeExibido}
            roleAtual={edicao.role}
            unidadeIdAtual={edicao.unidadeId}
            unidades={edicao.unidades}
            podeTodas
            organizacaoNome={edicao.organizacaoNome}
            className={`${base} border-azul-noite text-azul-noite hover:bg-azul-noite/10`}
          />
        )}
        {cartao ? (
          <div className="ml-auto border-l border-cinza-claro pl-2">{botaoSituacao}</div>
        ) : (
          botaoSituacao
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
