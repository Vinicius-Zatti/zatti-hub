"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarTransferenciaAction } from "@/app/(app)/financeiro-gerencial/lancamentos/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import type { ContaFinanceira } from "@/lib/financeiro-gerencial/tipos";

/** Transferência entre contas próprias lançada à mão (20/10/2026, pedido de Vinícius): sai de uma conta e
 * entra na outra, fora da DRE. Antes só existia pela Conciliação. Cartão de crédito fica de fora. */
export function BotaoTransferencia({ contas }: { contas: ContaFinanceira[] }) {
  const [aberto, setAberto] = useState(false);
  const disponiveis = contas.filter((c) => c.ativo && c.tipo !== "cartao_credito");
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Dinheiro que sai de uma conta sua e entra em outra conta sua. Não entra na DRE."
        className="shrink-0 rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-bold text-azul-petroleo hover:bg-azul-petroleo/10"
      >
        + Transferência entre contas
      </button>
      <ModalFlutuante aberto={aberto} onFechar={() => setAberto(false)}>
        {aberto && <FormularioTransferencia contas={disponiveis} onFechar={() => setAberto(false)} />}
      </ModalFlutuante>
    </>
  );
}

function FormularioTransferencia({ contas, onFechar }: { contas: ContaFinanceira[]; onFechar: () => void }) {
  const router = useRouter();
  const opcoes = contas.map((c) => ({ id: c.id, label: c.nome }));
  const [origem, setOrigem] = useState(contas[0]?.id ?? "");
  const [destino, setDestino] = useState(contas[1]?.id ?? "");
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeIsoBrasil());
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (contas.length < 2) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">Transferência entre contas</h2>
        <p className="text-sm text-cinza">
          Para transferir, a unidade precisa de pelo menos duas contas ativas (banco, caixa ou carteira digital). Cadastre a outra conta em
          Financeiro &gt; Contas financeiras.
        </p>
        <button type="button" onClick={onFechar} className="rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Fechar
        </button>
      </div>
    );
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!valor || valor <= 0) return setErro("Informe o valor.");
    if (origem === destino) return setErro("Origem e destino precisam ser contas diferentes.");
    startTransition(async () => {
      const r = await criarTransferenciaAction({ contaOrigemId: origem, contaDestinoId: destino, valor, data, descricao });
      if (!r.ok) return setErro(r.mensagem);
      router.refresh();
      onFechar();
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-bold text-azul-noite">Transferência entre contas</h2>
        <p className="text-xs text-cinza-medio">Sai de uma conta e entra na outra no mesmo dia. Mexe no saldo e no Fluxo de Caixa, não na DRE.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Sai da conta
        <SeletorComBusca value={origem} opcoes={opcoes} onChange={setOrigem} placeholder="Selecionar conta..." />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Entra na conta
        <SeletorComBusca value={destino} opcoes={opcoes} onChange={setDestino} placeholder="Selecionar conta..." />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Valor
          <CampoNumero value={valor} onChange={setValor} className="w-full" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Data
          <input
            type="date"
            required
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Descrição (opcional)
        <input
          value={descricao}
          maxLength={200}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: depósito do caixa da loja no banco"
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50">
          {isPending ? "Salvando..." : "Registrar transferência"}
        </button>
        <button
          type="button"
          onClick={onFechar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
