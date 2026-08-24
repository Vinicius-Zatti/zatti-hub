"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarContaFinanceiraAction, editarContaFinanceiraAction } from "@/app/(app)/financeiro-gerencial/contas/actions";
import { CampoNumero } from "@/components/campo-numero";
import type { ContaFinanceira, TipoContaFinanceira } from "@/lib/financeiro-gerencial/tipos";

const TIPO_LABEL: Record<TipoContaFinanceira, string> = {
  banco: "Conta bancária",
  caixa: "Caixa físico",
  carteira_digital: "Carteira digital",
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ContasFinanceirasGerenciador({ contas }: { contas: ContaFinanceira[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoContaFinanceira>("banco");
  const [saldoInicial, setSaldoInicial] = useState<number | null>(0);
  const [dataSaldoInicial, setDataSaldoInicial] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarContaFinanceiraAction({
        nome,
        tipo,
        saldoInicial: saldoInicial ?? 0,
        dataSaldoInicial,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setNome("");
      setSaldoInicial(0);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Contas financeiras</h1>
        <p className="text-sm text-cinza-medio">
          Conta bancária, caixa físico ou carteira digital - base do Fluxo de Caixa Realizado.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Nova conta</div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Nome
          <input
            required
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
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="mt-1 w-full rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Adicionar conta"}
        </button>
      </form>

      <div className="rounded-lg border border-cinza-claro bg-branco">
        {contas.length === 0 ? (
          <p className="p-4 text-sm text-cinza-medio">Nenhuma conta financeira cadastrada.</p>
        ) : (
          <ul className="divide-y divide-cinza-claro">
            {contas.map((conta) => (
              <LinhaConta key={conta.id} conta={conta} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LinhaConta({ conta }: { conta: ContaFinanceira }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [tipo, setTipo] = useState<TipoContaFinanceira>(conta.tipo);
  const [saldoInicial, setSaldoInicial] = useState<number | null>(conta.saldoInicial);
  const [dataSaldoInicial, setDataSaldoInicial] = useState(conta.dataSaldoInicial);
  const [ativo, setAtivo] = useState(conta.ativo);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await editarContaFinanceiraAction({
        id: conta.id,
        nome,
        tipo,
        saldoInicial: saldoInicial ?? 0,
        dataSaldoInicial,
        ativo,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (editando) {
    return (
      <li className="p-3">
        <form onSubmit={salvar} className="flex flex-col gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
          />
          <div className="flex gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoContaFinanceira)}
              className="flex-1 rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
            >
              {(Object.keys(TIPO_LABEL) as TipoContaFinanceira[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </select>
            <CampoNumero value={saldoInicial} onChange={setSaldoInicial} className="w-28" />
            <input
              type="date"
              value={dataSaldoInicial}
              onChange={(e) => setDataSaldoInicial(e.target.value)}
              className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-cinza-medio">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Ativa
          </label>
          {erro && <p className="text-xs text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <span className={`text-sm ${conta.ativo ? "text-cinza" : "text-cinza-medio line-through"}`}>{conta.nome}</span>
        <span className="ml-2 text-xs text-cinza-medio">{TIPO_LABEL[conta.tipo]}</span>
        <span className="ml-2 text-xs text-cinza-medio">
          Saldo inicial: R$ {conta.saldoInicial.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
      </div>
      <button type="button" onClick={() => setEditando(true)} className="shrink-0 text-xs font-semibold text-azul-petroleo">
        Editar
      </button>
    </li>
  );
}
