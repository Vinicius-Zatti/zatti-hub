"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarContaFinanceiraAction, editarContaFinanceiraAction } from "@/app/(app)/financeiro-gerencial/contas/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import type { ContaFinanceiraComSaldos, TipoContaFinanceira } from "@/lib/financeiro-gerencial/tipos";

const TIPO_LABEL: Record<TipoContaFinanceira, string> = {
  banco: "Conta bancária",
  caixa: "Caixa físico",
  carteira_digital: "Carteira digital",
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Criar/editar em modal (item 1 da correção de 25/08), cartão com saldo
 * atual e projetado (item 4) em vez da lista simples anterior. */
export function ContasFinanceirasGerenciador({ contas }: { contas: ContaFinanceiraComSaldos[] }) {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<ContaFinanceiraComSaldos | null>(null);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Contas financeiras</h1>
          <p className="text-sm text-cinza-medio">
            Conta bancária, caixa físico ou carteira digital - base do Fluxo de Caixa Realizado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
        >
          + Nova conta
        </button>
      </div>

      {contas.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhuma conta financeira cadastrada.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {contas.map((conta) => (
            <CartaoConta key={conta.id} conta={conta} onEditar={() => setEditando(conta)} />
          ))}
        </div>
      )}

      <ModalFlutuante aberto={criando} onFechar={() => setCriando(false)}>
        <FormularioConta onSalvo={() => setCriando(false)} onCancelar={() => setCriando(false)} />
      </ModalFlutuante>

      <ModalFlutuante aberto={editando !== null} onFechar={() => setEditando(null)}>
        {editando && (
          <FormularioConta conta={editando} onSalvo={() => setEditando(null)} onCancelar={() => setEditando(null)} />
        )}
      </ModalFlutuante>
    </div>
  );
}

function CartaoConta({ conta, onEditar }: { conta: ContaFinanceiraComSaldos; onEditar: () => void }) {
  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-semibold ${conta.ativo ? "text-cinza" : "text-cinza-medio line-through"}`}>{conta.nome}</div>
          <div className="text-xs text-cinza-medio">{TIPO_LABEL[conta.tipo]}</div>
        </div>
        <button type="button" onClick={onEditar} className="shrink-0 text-xs font-semibold text-azul-petroleo">
          Editar
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">Saldo inicial</div>
          <div className="font-mono text-cinza">{brl(conta.saldoInicial)}</div>
          <div className="text-[10px] text-cinza-medio">{conta.dataSaldoInicial}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">Saldo atual</div>
          <div className="font-mono font-semibold text-azul-noite">{brl(conta.saldoAtual)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">Saldo projetado</div>
          <div className="font-mono text-cinza">{brl(conta.saldoProjetado)}</div>
        </div>
      </div>
    </div>
  );
}

function FormularioConta({
  conta,
  onSalvo,
  onCancelar,
}: {
  conta?: ContaFinanceiraComSaldos;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [tipo, setTipo] = useState<TipoContaFinanceira>(conta?.tipo ?? "banco");
  const [saldoInicial, setSaldoInicial] = useState<number | null>(conta?.saldoInicial ?? 0);
  const [dataSaldoInicial, setDataSaldoInicial] = useState(conta?.dataSaldoInicial ?? hoje());
  const [ativo, setAtivo] = useState(conta?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const dados = { nome, tipo, saldoInicial: saldoInicial ?? 0, dataSaldoInicial };
      const resultado = conta
        ? await editarContaFinanceiraAction({ id: conta.id, ...dados, ativo })
        : await criarContaFinanceiraAction(dados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onSalvo();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">{conta ? "Editar conta financeira" : "Nova conta financeira"}</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Nome
        <input
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Banco do Brasil, Caixa da loja"
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Tipo
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoContaFinanceira)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        >
          {(Object.keys(TIPO_LABEL) as TipoContaFinanceira[]).map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Saldo inicial
          <CampoNumero value={saldoInicial} onChange={setSaldoInicial} className="w-full" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Data do saldo inicial
          <input
            type="date"
            value={dataSaldoInicial}
            onChange={(e) => setDataSaldoInicial(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
      </div>
      {conta && (
        <label className="flex items-center gap-2 text-xs text-cinza-medio">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativa
        </label>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : conta ? "Salvar" : "Adicionar conta"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
