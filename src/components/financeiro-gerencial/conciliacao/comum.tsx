"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decidirMovimentosAction } from "@/app/(app)/financeiro-gerencial/conciliacao/decisoes-actions";
import { novaChaveEnvio } from "@/lib/conciliacao/decisao-tela";
import type { OpcaoBusca } from "@/components/financeiro-gerencial/seletor-com-busca";

// Peças comuns das telas de decisão da Conciliação (modal Conciliar, lote e conciliados).

export type Conta = { id: string; nome: string; ativo: boolean };

/** O que a tela de decisão precisa saber da unidade. */
export type ContextoDecisao = {
  contas: Conta[];
  /** Plano de Contas de nível conta, não arquivado, compatível com entrada (receita). */
  planoReceita: OpcaoBusca[];
  /** Plano de Contas de nível conta, não arquivado, compatível com saída (despesa). */
  planoDespesa: OpcaoBusca[];
  /** Gestão ou master: desfaz conciliação e quita o restante como desconto. */
  podeGestao: boolean;
};

export type Aviso = { tipo: "ok" | "erro"; texto: string };

export function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function brlCentavos(c: number): string {
  return brl(c / 100);
}

type ItemEnvio = Record<string, unknown> & { movimentoId: string; acao: string };

/** Envia decisões com chave nova, bloqueia duplo clique, atualiza a página. Em sucesso chama
 * `aoConcluir` (quem chamou fecha o modal e mostra o aviso); em erro devolve a mensagem para
 * aparecer dentro do modal, sem perder o que a pessoa preencheu. */
export function useEnvioDecisao(aoConcluir: (texto: string) => void) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const travado = useRef(false);

  function enviar(itens: ItemEnvio[], textoSucesso: string) {
    if (travado.current) return;
    travado.current = true;
    setErro(null);
    iniciar(async () => {
      try {
        const r = await decidirMovimentosAction({ chave: novaChaveEnvio(), itens });
        router.refresh();
        if (r.ok) aoConcluir(textoSucesso);
        else setErro(r.mensagem);
      } catch {
        setErro("Não foi possível gravar a conciliação. Tente de novo.");
      } finally {
        travado.current = false;
      }
    });
  }

  return { enviar, pendente, erro, setErro };
}

export function MensagemErro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p role="alert" className="rounded-md border border-vermelho bg-vermelho/5 p-2 text-sm text-vermelho">{texto}</p>;
}

export function BotoesConfirmar({
  pendente,
  podeConfirmar,
  podeAprender,
  motivoSemAprender,
  aoConfirmar,
}: {
  pendente: boolean;
  podeConfirmar: boolean;
  podeAprender: boolean;
  motivoSemAprender?: string;
  aoConfirmar: (aprender: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pendente || !podeConfirmar}
          onClick={() => aoConfirmar(false)}
          className="rounded-md border border-azul-petroleo px-3 py-1.5 text-sm font-semibold text-azul-petroleo disabled:opacity-50"
        >
          Confirmar só este
        </button>
        <button
          type="button"
          disabled={pendente || !podeConfirmar || !podeAprender}
          title={!podeAprender ? motivoSemAprender : "Confirma e grava uma regra: os próximos movimentos com esta descrição chegam com esta sugestão"}
          onClick={() => aoConfirmar(true)}
          className="rounded-md bg-ambar px-3 py-1.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {pendente ? "Gravando..." : "Confirmar e aprender"}
        </button>
      </div>
      {!podeAprender && motivoSemAprender && <p className="text-right text-xs text-cinza-medio">{motivoSemAprender}</p>}
    </div>
  );
}
