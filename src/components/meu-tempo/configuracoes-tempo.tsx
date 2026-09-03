"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  criarFrenteTempoAction,
  criarMetaMensalTempoAction,
  criarValorHoraTempoAction,
  editarFrenteTempoAction,
} from "@/app/(app)/meu-tempo/configuracoes/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { FrenteTempo, MetaMensalTempo, TipoFrenteTempo, ValorHoraTempo } from "@/lib/meu-tempo/tipos";

const TIPO_FRENTE_LABEL: Record<TipoFrenteTempo, string> = { paga: "Paga", propria: "Própria" };

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ConfiguracoesTempo({
  frentes,
  valoresHora,
  metasMensais,
}: {
  frentes: FrenteTempo[];
  valoresHora: ValorHoraTempo[];
  metasMensais: MetaMensalTempo[];
}) {
  const [criandoFrente, setCriandoFrente] = useState(false);
  const [editandoFrente, setEditandoFrente] = useState<FrenteTempo | null>(null);
  const [registrandoValorHora, setRegistrandoValorHora] = useState(false);
  const [registrandoMeta, setRegistrandoMeta] = useState(false);

  const valorHoraAtual = valoresHora[0] ?? null;
  const frentesPagas = frentes.filter((f) => f.tipo === "paga");
  const metaAtualPorFrente = useMemo(() => {
    const mapa = new Map<string, MetaMensalTempo>();
    for (const m of metasMensais) {
      if (!mapa.has(m.frenteId)) mapa.set(m.frenteId, m);
    }
    return mapa;
  }, [metasMensais]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Configurações</h1>
        <p className="text-sm text-cinza-medio">Frentes, valor-hora e meta mensal do módulo Meu Tempo.</p>
      </div>

      {/* Frentes */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Frentes</h2>
          <button
            type="button"
            onClick={() => setCriandoFrente(true)}
            className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
          >
            + Nova frente
          </button>
        </div>
        {frentes.length === 0 ? (
          <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhuma frente cadastrada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {frentes.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-cinza-claro bg-branco p-3">
                <div className="min-w-0">
                  <div className={`font-semibold ${f.ativo ? "text-cinza" : "text-cinza-medio line-through"}`}>{f.nome}</div>
                  <div className="text-xs text-cinza-medio">
                    {TIPO_FRENTE_LABEL[f.tipo]}
                    {!f.ativo ? " - inativa" : ""}
                  </div>
                </div>
                <button type="button" onClick={() => setEditandoFrente(f)} className="shrink-0 text-xs font-semibold text-azul-petroleo">
                  Editar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Valor-hora */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Valor-hora</h2>
          <button
            type="button"
            onClick={() => setRegistrandoValorHora(true)}
            className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
          >
            + Novo valor-hora
          </button>
        </div>
        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          {valorHoraAtual ? (
            <>
              <div className="text-2xl font-bold text-azul-noite">{brl(valorHoraAtual.valor)}</div>
              <div className="text-xs text-cinza-medio">vigente desde {formatarDataBr(valorHoraAtual.vigenteDesde)}</div>
            </>
          ) : (
            <p className="text-sm text-cinza-medio">Nenhum valor-hora cadastrado ainda.</p>
          )}
        </div>
        {valoresHora.length > 1 && (
          <details className="text-xs text-cinza-medio">
            <summary className="cursor-pointer font-semibold">Ver histórico ({valoresHora.length - 1} anterior{valoresHora.length - 1 > 1 ? "es" : ""})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {valoresHora.slice(1).map((v) => (
                <li key={v.id}>
                  {brl(v.valor)} - vigente desde {formatarDataBr(v.vigenteDesde)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Meta mensal */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Meta mensal por frente</h2>
          <button
            type="button"
            onClick={() => setRegistrandoMeta(true)}
            disabled={frentesPagas.length === 0}
            className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95 disabled:opacity-50"
          >
            + Nova meta
          </button>
        </div>
        {frentesPagas.length === 0 ? (
          <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Cadastre uma frente paga primeiro.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {frentesPagas.map((f) => {
              const meta = metaAtualPorFrente.get(f.id);
              return (
                <div key={f.id} className="rounded-lg border border-cinza-claro bg-branco p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-cinza">{f.nome}</span>
                    <span className="font-mono text-sm font-bold text-azul-noite">{meta ? brl(meta.valorMensal ?? 0) : "-"}</span>
                  </div>
                  {meta && <div className="text-xs text-cinza-medio">vigente desde {formatarDataBr(meta.vigenteDesde)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ModalFlutuante aberto={criandoFrente} onFechar={() => setCriandoFrente(false)}>
        <FormularioFrente onSalvo={() => setCriandoFrente(false)} onCancelar={() => setCriandoFrente(false)} />
      </ModalFlutuante>

      <ModalFlutuante aberto={editandoFrente !== null} onFechar={() => setEditandoFrente(null)}>
        {editandoFrente && <FormularioFrente frente={editandoFrente} onSalvo={() => setEditandoFrente(null)} onCancelar={() => setEditandoFrente(null)} />}
      </ModalFlutuante>

      <ModalFlutuante aberto={registrandoValorHora} onFechar={() => setRegistrandoValorHora(false)}>
        <FormularioValorHora onSalvo={() => setRegistrandoValorHora(false)} onCancelar={() => setRegistrandoValorHora(false)} />
      </ModalFlutuante>

      <ModalFlutuante aberto={registrandoMeta} onFechar={() => setRegistrandoMeta(false)}>
        <FormularioMetaMensal frentesPagas={frentesPagas} onSalvo={() => setRegistrandoMeta(false)} onCancelar={() => setRegistrandoMeta(false)} />
      </ModalFlutuante>
    </div>
  );
}

function FormularioFrente({ frente, onSalvo, onCancelar }: { frente?: FrenteTempo; onSalvo: () => void; onCancelar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(frente?.nome ?? "");
  const [tipo, setTipo] = useState<TipoFrenteTempo>(frente?.tipo ?? "paga");
  const [ativo, setAtivo] = useState(frente?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = frente
        ? await editarFrenteTempoAction({ id: frente.id, nome, tipo, ativo })
        : await criarFrenteTempoAction({ nome, tipo });
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
      <h2 className="font-display text-lg font-bold text-azul-noite">{frente ? "Editar frente" : "Nova frente"}</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Nome
        <input
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Horizzon, Próprio - Verato"
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFrenteTempo)} className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza">
          <option value="paga">Paga</option>
          <option value="propria">Própria</option>
        </select>
      </label>
      {frente && (
        <label className="flex items-center gap-2 text-xs text-cinza-medio">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativa
        </label>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50">
          {isPending ? "Salvando..." : frente ? "Salvar" : "Adicionar frente"}
        </button>
        <button type="button" onClick={onCancelar} disabled={isPending} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioValorHora({ onSalvo, onCancelar }: { onSalvo: () => void; onCancelar: () => void }) {
  const router = useRouter();
  const [valor, setValor] = useState<number | null>(null);
  const [vigenteDesde, setVigenteDesde] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarValorHoraTempoAction({ valor: valor ?? 0, vigenteDesde });
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
      <h2 className="font-display text-lg font-bold text-azul-noite">Novo valor-hora</h2>
      <p className="text-xs text-cinza-medio">Correção nunca substitui o valor anterior - vira uma linha nova de histórico, vigente a partir da data escolhida.</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Valor por hora (R$)
        <CampoNumero value={valor} onChange={setValor} className="w-full" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Vigente desde
        <input
          type="date"
          required
          value={vigenteDesde}
          onChange={(e) => setVigenteDesde(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending || !valor} className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50">
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={onCancelar} disabled={isPending} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioMetaMensal({ frentesPagas, onSalvo, onCancelar }: { frentesPagas: FrenteTempo[]; onSalvo: () => void; onCancelar: () => void }) {
  const router = useRouter();
  const opcoesFrente = useMemo(() => frentesPagas.map((f) => ({ id: f.id, label: f.nome })), [frentesPagas]);
  const [frenteId, setFrenteId] = useState(opcoesFrente[0]?.id ?? "");
  const [valorMensal, setValorMensal] = useState<number | null>(null);
  const [vigenteDesde, setVigenteDesde] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarMetaMensalTempoAction({ frenteId, valorMensal: valorMensal ?? 0, vigenteDesde });
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
      <h2 className="font-display text-lg font-bold text-azul-noite">Nova meta mensal</h2>
      <p className="text-xs text-cinza-medio">Correção nunca substitui a meta anterior - vira uma linha nova de histórico, vigente a partir da data escolhida.</p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Frente
        <SeletorComBusca value={frenteId} opcoes={opcoesFrente} onChange={setFrenteId} placeholder="Selecionar frente..." />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Meta mensal (R$)
        <CampoNumero value={valorMensal} onChange={setValorMensal} className="w-full" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Vigente desde
        <input
          type="date"
          required
          value={vigenteDesde}
          onChange={(e) => setVigenteDesde(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={isPending || !frenteId || !valorMensal} className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50">
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={onCancelar} disabled={isPending} className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio">
          Cancelar
        </button>
      </div>
    </form>
  );
}
