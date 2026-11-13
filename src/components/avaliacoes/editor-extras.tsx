"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarExtrasAction } from "@/app/(app)/avaliacoes/actions";
import { LIMITE_ATENDENTES, LIMITE_NOME_ATENDENTE } from "@/lib/avaliacoes/perguntas";

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";

/** Nomes de quem atende (um por linha) e o link de pedir direto, num modal. */
export function EditorExtras({ atendentes, linkPedidoDireto }: { atendentes: string[]; linkPedidoDireto: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [nomes, setNomes] = useState(atendentes.join("\n"));
  const [link, setLink] = useState(linkPedidoDireto ?? "");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNomes(atendentes.join("\n"));
          setLink(linkPedidoDireto ?? "");
          setErro(null);
          setAberto(true);
        }}
        className="self-start rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
      >
        Editar quem atende e o link de pedir direto
      </button>
      <ModalFlutuante aberto={aberto} onFechar={() => !pendente && setAberto(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await salvarExtrasAction({ atendentes: nomes.split("\n"), linkPedidoDireto: link });
              if ("erro" in r) {
                setErro(r.erro);
                return;
              }
              setAberto(false);
              router.refresh();
            });
          }}
          className="flex flex-col gap-3"
        >
          <h2 className="font-display text-lg font-bold text-azul-noite">Quem atende e pedir direto</h2>
          <label className={ROTULO}>
            Quem atende no salão (um nome por linha, até {LIMITE_ATENDENTES})
            <textarea className={CAMPO} rows={6} value={nomes} onChange={(e) => setNomes(e.target.value)} placeholder={"Ana\nBruno\nCarla"} />
            <span className="mt-1 block font-normal">
              Aparecem na pergunta &quot;quem atendeu&quot; do salão, com a opção &quot;não lembro o nome&quot;. Use o nome que o cliente conhece (até {LIMITE_NOME_ATENDENTE}{" "}
              letras). A pergunta só aparece se estiver ligada em Perguntas.
            </span>
          </label>
          <label className={ROTULO}>
            Link de pedir direto (opcional)
            <input
              className={CAMPO}
              type="url"
              inputMode="url"
              placeholder="https://wa.me/5516999990000 ou o link do cardápio"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <span className="mt-1 block font-normal">
              Aparece no fim da pesquisa dos apps (iFood, 99), convidando a pedir direto com vocês da próxima vez. Pode ser o link do WhatsApp (wa.me) ou do cardápio
              digital. Sem link, o convite não aparece.
            </span>
          </label>
          {erro && <p className="text-sm text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pendente} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
              {pendente ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
              Cancelar
            </button>
          </div>
        </form>
      </ModalFlutuante>
    </>
  );
}
