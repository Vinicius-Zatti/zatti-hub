"use client";

import { useState } from "react";
import { DicaCalculo } from "@/components/dica-calculo";
import { TabelaRolavel } from "@/components/tabela-rolavel";

/** Peças comuns às duas abas do painel de operação, no mesmo desenho do funil
 * do Comercial (`components/comercial/funil.tsx`): colunas dentro do
 * `TabelaRolavel` no desktop, arrastar o cartão para outra coluna, destaque
 * âmbar na coluna alvo e aviso quando o servidor recusa. */

export type ArrasteCartao = { aoIniciar: () => void; aoTerminar: () => void; ativo: boolean };

export function useArrasteColunas<K extends string>(aoSoltar: (id: string, coluna: K) => void) {
  const [arrastado, setArrastado] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<K | null>(null);

  function propsColuna(coluna: K) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!arrastado) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (colunaAlvo !== coluna) setColunaAlvo(coluna);
      },
      onDragLeave: (e: React.DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && colunaAlvo === coluna) setColunaAlvo(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = arrastado;
        setArrastado(null);
        setColunaAlvo(null);
        if (id) aoSoltar(id, coluna);
      },
      destacada: colunaAlvo === coluna,
    };
  }

  function arrasteDe(id: string): ArrasteCartao {
    return {
      aoIniciar: () => setArrastado(id),
      aoTerminar: () => {
        setArrastado(null);
        setColunaAlvo(null);
      },
      ativo: arrastado === id,
    };
  }

  return { propsColuna, arrasteDe };
}

export function QuadroColunas({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) {
  return (
    <TabelaRolavel ariaLabel={ariaLabel} className="max-h-[75vh] rounded-lg border border-cinza-claro bg-branco">
      <div className="flex w-max gap-3 p-2">{children}</div>
    </TabelaRolavel>
  );
}

export function ColunaKanban({
  titulo,
  total,
  destacada,
  children,
  ...eventos
}: {
  titulo: string;
  total: number;
  destacada: boolean;
  children: React.ReactNode;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <section
      {...eventos}
      className={`flex min-h-40 w-64 shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors ${
        destacada ? "bg-ambar/15 ring-2 ring-ambar" : "bg-azul-noite/5"
      }`}
    >
      <h2 className="flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-azul-noite">
        {titulo}
        <span className="rounded-full bg-branco px-2 text-cinza-medio">{total}</span>
      </h2>
      {children}
    </section>
  );
}

/** Props de arrastar do cartão; sem `arraste` (celular), o cartão não arrasta. */
export function propsCartaoArrastavel(id: string, arraste: ArrasteCartao | undefined, dica: string) {
  if (!arraste) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      arraste.aoIniciar();
    },
    onDragEnd: arraste.aoTerminar,
    title: dica,
  };
}

export function AvisoMover({ texto, aoFechar }: { texto: string | null; aoFechar: () => void }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-ambar bg-ambar/10 px-3 py-2 text-sm text-azul-noite">
      {texto}
      <button type="button" className="shrink-0 text-xs font-semibold text-cinza-medio hover:underline" onClick={aoFechar}>
        Fechar aviso
      </button>
    </p>
  );
}

export function Indicador({ rotulo, valor, dica, alerta }: { rotulo: string; valor: number; dica: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-cinza-claro bg-branco p-3">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
        {rotulo}
        <DicaCalculo rotulo={rotulo} texto={dica} />
      </p>
      <p className={`font-display text-2xl font-bold ${alerta && valor > 0 ? "text-vermelho" : "text-azul-noite"}`}>{valor}</p>
    </div>
  );
}

export function CampoFiltro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">{rotulo}{children}</label>;
}
