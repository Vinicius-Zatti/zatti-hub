"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desfazerDecisaoAction } from "@/app/(app)/financeiro-gerencial/conciliacao/decisoes-actions";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { textoAcaoDecisao } from "@/lib/conciliacao/decisao-tela";
import type { DecisaoResumo } from "@/lib/banco/conciliacao-decisoes";
import { brl, MensagemErro } from "./comum";

function dataHoraBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/** Movimentos já tratados nos últimos 60 dias. Só Gestão/master vê "Desfazer". */
export function Conciliados({ decisoes, podeGestao, aoConcluir }: { decisoes: DecisaoResumo[]; podeGestao: boolean; aoConcluir: (t: string) => void }) {
  const [desfazer, setDesfazer] = useState<DecisaoResumo | null>(null);

  if (decisoes.length === 0) {
    return <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhum movimento conciliado nos últimos 60 dias.</p>;
  }

  return (
    <>
      <TabelaRolavel className="max-h-[75vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Movimentos conciliados">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="120px">Conciliado em</Th>
              <Th larguraFixa="104px">Data</Th>
              <Th fixo>Descrição</Th>
              <Th align="right">Valor</Th>
              <Th>O que foi feito</Th>
              <Th>Motivo</Th>
              {podeGestao && <Th> </Th>}
            </tr>
          </thead>
          <tbody>
            {decisoes.map((d) => (
              <tr key={d.id} className="border-t border-cinza-claro whitespace-nowrap">
                <td className="px-3 py-2">{dataHoraBr(d.decididoEm)}</td>
                <td className="px-3 py-2">{d.data ? formatarDataBr(d.data) : "-"}</td>
                <td className="max-w-[300px] truncate px-3 py-2" title={d.descricao}>{d.descricao}</td>
                <td className={`px-3 py-2 text-right font-semibold ${d.direcao === "saida" ? "text-vermelho" : "text-verde"}`}>
                  {d.direcao === "saida" ? "-" : "+"} {brl(d.valor)}
                </td>
                <td className="px-3 py-2">{textoAcaoDecisao(d.acao)}</td>
                <td className="max-w-[240px] truncate px-3 py-2 text-xs" title={d.motivo ?? undefined}>{d.motivo ?? "-"}</td>
                {podeGestao && (
                  <td className="px-3 py-2 text-xs">
                    <button type="button" onClick={() => setDesfazer(d)} className="font-semibold text-vermelho underline">Desfazer</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
      <ModalFlutuante aberto={desfazer !== null} onFechar={() => setDesfazer(null)}>
        {desfazer && (
          <Desfazer
            decisao={desfazer}
            onFechar={() => setDesfazer(null)}
            aoConcluir={(t) => {
              setDesfazer(null);
              aoConcluir(t);
            }}
          />
        )}
      </ModalFlutuante>
    </>
  );
}

function Desfazer({ decisao, onFechar, aoConcluir }: { decisao: DecisaoResumo; onFechar: () => void; aoConcluir: (t: string) => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const travado = useRef(false);
  const valido = motivo.trim().length >= 3;

  function confirmar() {
    if (travado.current) return;
    travado.current = true;
    setErro(null);
    iniciar(async () => {
      try {
        const r = await desfazerDecisaoAction({ decisaoId: decisao.id, motivo: motivo.trim() });
        router.refresh();
        if (r.ok) aoConcluir("Conciliação desfeita. O movimento voltou para a fila.");
        else setErro(r.mensagem);
      } catch {
        setErro("Não foi possível desfazer a conciliação. Tente de novo.");
      } finally {
        travado.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <h2 className="font-display text-lg font-bold text-azul-noite">Desfazer conciliação</h2>
      <p>
        {decisao.data ? formatarDataBr(decisao.data) : "-"} · {brl(decisao.valor)} · {textoAcaoDecisao(decisao.acao)}
        <span className="block truncate text-cinza-medio" title={decisao.descricao}>{decisao.descricao}</span>
      </p>
      <p className="text-xs text-cinza-medio">Nada é apagado: as baixas recebem estorno, o que foi criado pela conciliação é cancelado e o movimento volta para a fila.</p>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Motivo (obrigatório)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={3} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
      </label>
      {!valido && motivo.length > 0 && <p className="text-xs text-vermelho">Escreva pelo menos 3 caracteres.</p>}
      <MensagemErro texto={erro} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-cinza-medio">Cancelar</button>
        <button type="button" disabled={pendente || !valido} onClick={confirmar} className="rounded-md bg-vermelho px-3 py-1.5 font-bold text-branco disabled:opacity-50">
          {pendente ? "Desfazendo..." : "Desfazer"}
        </button>
      </div>
    </div>
  );
}
