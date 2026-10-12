"use client";

import { useEffect, useState } from "react";
import { listarTransferenciasAbertasAction } from "@/app/(app)/financeiro-gerencial/conciliacao/decisoes-actions";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { TransferenciaAberta } from "@/lib/banco/conciliacao-decisoes";
import type { ItemFila } from "@/lib/banco/conciliacao";
import { brl, MensagemErro, useEnvioDecisao, type ContextoDecisao } from "./comum";

/** Aba "Transferência": dinheiro entre contas próprias, fora da DRE. */
export function AbaTransferencia({ movimento, contexto, aoConcluir }: { movimento: ItemFila; contexto: ContextoDecisao; aoConcluir: (t: string) => void }) {
  const [abertas, setAbertas] = useState<TransferenciaAberta[] | null>(null);
  const [escolha, setEscolha] = useState<{ tipo: "outra_ponta"; id: string } | { tipo: "nova"; contaId: string } | null>(null);
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);
  const nome = new Map(contexto.contas.map((c) => [c.id, c.nome]));
  const saida = movimento.direcao === "saida";
  const outrasContas = contexto.contas.filter((c) => c.ativo && c.id !== movimento.contaFinanceiraId).map((c) => ({ id: c.id, label: c.nome }));

  useEffect(() => {
    let ativo = true;
    listarTransferenciasAbertasAction(movimento.id)
      .then((r) => ativo && setAbertas(r.ok ? r.itens : []))
      .catch(() => ativo && setAbertas([]));
    return () => {
      ativo = false;
    };
  }, [movimento.id]);

  function confirmar() {
    if (!escolha) return;
    enviar(
      [
        {
          movimentoId: movimento.id,
          acao: "transferencia",
          contaContraparteId: escolha.tipo === "nova" ? escolha.contaId : null,
          transferenciaId: escolha.tipo === "outra_ponta" ? escolha.id : null,
        },
      ],
      escolha.tipo === "outra_ponta" ? "Transferência completada com a outra ponta." : "Transferência registrada. A outra ponta fica esperando o extrato da outra conta.",
    );
  }

  const podeConfirmar = escolha !== null && (escolha.tipo === "outra_ponta" || escolha.contaId !== "");

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-cinza-medio">Transferência entre contas da própria empresa não é receita nem despesa e fica fora da DRE.</p>
      {abertas === null && <p className="text-cinza-medio">Buscando transferências esperando a outra ponta...</p>}
      {abertas && abertas.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-semibold">É a outra ponta de uma transferência já registrada?</span>
          {abertas.map((t) => (
            <label key={t.id} className={`flex items-start gap-2 rounded-md border p-2 ${escolha?.tipo === "outra_ponta" && escolha.id === t.id ? "border-azul-petroleo bg-azul-petroleo/5" : "border-cinza-claro"}`}>
              <input type="radio" name="transferencia" className="mt-1" checked={escolha?.tipo === "outra_ponta" && escolha.id === t.id} onChange={() => setEscolha({ tipo: "outra_ponta", id: t.id })} />
              <span>
                {formatarDataBr(t.data)} · {brl(t.valor)} · de {nome.get(t.contaOrigemId) ?? "outra conta"} para {nome.get(t.contaDestinoId) ?? "outra conta"}
              </span>
            </label>
          ))}
        </div>
      )}
      <label className="flex items-start gap-2">
        <input type="radio" name="transferencia" className="mt-1" checked={escolha?.tipo === "nova"} onChange={() => setEscolha({ tipo: "nova", contaId: "" })} />
        <span className="font-semibold">{saida ? "Saiu desta conta para outra conta própria" : "Veio de outra conta própria"}</span>
      </label>
      {escolha?.tipo === "nova" && (
        <SeletorComBusca
          value={escolha.contaId}
          opcoes={outrasContas}
          onChange={(id) => setEscolha({ tipo: "nova", contaId: id })}
          placeholder={saida ? "Conta que recebeu" : "Conta de onde saiu"}
        />
      )}
      {outrasContas.length === 0 && <p className="text-xs text-cinza-medio">Não há outra conta financeira ativa nesta unidade.</p>}
      <MensagemErro texto={erro} />
      <div className="flex justify-end">
        <button type="button" disabled={pendente || !podeConfirmar} onClick={confirmar} className="rounded-md bg-ambar px-3 py-1.5 text-sm font-bold text-azul-noite disabled:opacity-50">
          {pendente ? "Gravando..." : "Confirmar transferência"}
        </button>
      </div>
    </div>
  );
}
