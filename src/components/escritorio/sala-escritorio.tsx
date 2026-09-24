"use client";

import type { PosicaoMontada, SalaMontada } from "@/lib/escritorio/escritorio";
import { SITUACAO } from "./rotulos";

/** Avatar genérico e próprio. Nunca foto ou imagem de pessoa real. */
export function Avatar({ posicao }: { posicao: PosicaoMontada }) {
  if (!posicao.ocupante) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-cinza-medio text-lg text-cinza-medio" aria-hidden="true">
        +
      </span>
    );
  }
  const pessoa = posicao.ocupante.tipo === "pessoa";
  return (
    <span
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${pessoa ? "bg-ambar text-azul-noite" : "border-2 border-ambar text-ambar"}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7H4Z" />
      </svg>
      {!pessoa && (
        <span className="absolute -bottom-1 -right-1 rounded bg-ambar px-1 text-[9px] font-bold leading-tight text-azul-noite">IA</span>
      )}
    </span>
  );
}

function CartaoPosicao({ posicao, aoAbrir }: { posicao: PosicaoMontada; aoAbrir: () => void }) {
  const vaga = posicao.ocupanteId === null;
  const situacao = SITUACAO[posicao.estado.situacao];
  // Ocupante com nome próprio vence; agente genérico mostra o nome de inspiração.
  const nome = vaga
    ? "Posição vaga"
    : posicao.ocupanteId !== "agente"
      ? posicao.ocupante?.nome
      : posicao.arquetipo?.nome ?? posicao.ocupante?.nome;
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={`flex min-h-[76px] w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
        vaga
          ? "border border-dashed border-cinza-medio/70 bg-transparent hover:border-ambar"
          : `border bg-white/5 hover:bg-white/10 ${posicao.lider ? "border-ambar/70" : "border-white/10"}`
      }`}
    >
      <Avatar posicao={posicao} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${vaga ? "text-branco/60" : "text-branco"}`} title={nome}>
          {nome}
        </span>
        <span className="block truncate text-xs text-branco/60" title={posicao.cargo}>{posicao.cargo}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-branco/75">
          <span className={`h-2 w-2 rounded-full ${situacao.ponto}`} />
          {situacao.rotulo}
        </span>
      </span>
    </button>
  );
}

function Barra({ rotulo, valor, detalhe }: { rotulo: string; valor: number | null; detalhe: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-branco/70">
        <span className="font-semibold uppercase tracking-wide">{rotulo}</span>
        <span>{detalhe}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-ambar" style={{ width: `${valor ?? 0}%` }} />
      </div>
    </div>
  );
}

export function SalaEscritorio({ sala, aoAbrir }: { sala: SalaMontada; aoAbrir: (p: PosicaoMontada) => void }) {
  const { indicadores: ind } = sala;
  const horizzon = sala.empresa === "horizzon";
  const compacta = sala.tipo === "ceo" || sala.tipo === "recepcao";
  return (
    <section
      aria-label={sala.nome}
      className={`flex flex-col gap-3 rounded-xl bg-azul-noite p-4 text-branco ${horizzon ? "border-2 border-ambar" : "border border-white/10"}`}
    >
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-bold">{sala.nome}</h2>
          {horizzon && <span className="rounded bg-ambar px-1.5 py-0.5 text-[10px] font-bold uppercase text-azul-noite">Horizzon Work</span>}
        </div>
        <p className="text-xs text-branco/70">{sala.resumo}</p>
      </header>

      {!compacta && (
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <Barra rotulo="Ocupação" valor={Math.round((ind.preenchidas / ind.total) * 100)} detalhe={`${ind.preenchidas} de ${ind.total}`} />
          <Barra rotulo="Maturidade" valor={ind.maturidade} detalhe={ind.maturidade === null ? "-" : `${ind.maturidade}%`} />
        </div>
      )}

      <div className={`grid gap-2 ${compacta ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {sala.posicoes.map((p) => (
          <CartaoPosicao key={p.id} posicao={p} aoAbrir={() => aoAbrir(p)} />
        ))}
      </div>

      {!compacta && (
        <p className="text-[11px] text-branco/60">
          {ind.entregas} {ind.entregas === 1 ? "entrega registrada" : "entregas registradas"}
          {ind.vagas > 0 && ` · ${ind.vagas} ${ind.vagas === 1 ? "vaga" : "vagas"}`}
        </p>
      )}
      {ind.alertas.map((a) => (
        <p key={a} className="rounded-md border border-vermelho/60 bg-vermelho/15 px-2 py-1.5 text-xs text-branco">
          {a}
        </p>
      ))}
    </section>
  );
}
