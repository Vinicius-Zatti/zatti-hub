"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ModalFlutuante } from "@/components/modal-flutuante";

/** Peças comuns da Gestão de Clientes. Modal é sempre `ModalFlutuante` (regra
 * do AGENTS.md: criar e editar nunca ficam soltos na página). */

export const classeCampo =
  "w-full rounded-lg border border-cinza-claro bg-branco px-3 py-2 text-sm focus:border-ambar focus:outline-none";
export const classeBotao =
  "rounded-lg bg-azul-noite px-3 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50";
export const classeBotaoLeve =
  "rounded-lg border border-cinza-claro px-3 py-2 text-sm font-semibold text-cinza-medio hover:border-ambar hover:text-azul-noite";

export function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-bold uppercase tracking-wide text-cinza-medio">{rotulo}</span>
      {children}
      {dica && <span className="text-xs text-cinza-medio">{dica}</span>}
    </label>
  );
}

const TONS = {
  neutro: "bg-cinza-claro/60 text-azul-noite",
  bom: "bg-verde/15 text-verde",
  atencao: "bg-ambar/20 text-azul-noite",
  critico: "bg-vermelho/15 text-vermelho",
} as const;

export function Selo({ children, tom = "neutro" }: { children: React.ReactNode; tom?: keyof typeof TONS }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${TONS[tom]}`}>{children}</span>;
}

export function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-cinza-claro bg-branco p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-azul-noite">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-cinza-medio">{children}</p>;
}

type Resultado = { ok: true; id?: string; texto?: string } | { ok: false; mensagem: string };

/** Executa uma Server Action, mostra o erro público e atualiza a página. */
export function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function executar(acao: () => Promise<Resultado>, aoConcluir?: (r: Extract<Resultado, { ok: true }>) => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      aoConcluir?.(r);
      router.refresh();
    });
  }
  return { pendente, erro, setErro, executar };
}

export function ModalFormulario({
  aberto,
  titulo,
  onFechar,
  onSalvar,
  pendente,
  erro,
  children,
  rotuloSalvar = "Salvar",
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  onSalvar: () => void;
  pendente: boolean;
  erro: string | null;
  children: React.ReactNode;
  rotuloSalvar?: string;
}) {
  return (
    <ModalFlutuante aberto={aberto} onFechar={onFechar}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar();
        }}
      >
        <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
        {children}
        {erro && <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={classeBotaoLeve}>
            Cancelar
          </button>
          <button type="submit" disabled={pendente} className={classeBotao}>
            {pendente ? "Salvando..." : rotuloSalvar}
          </button>
        </div>
      </form>
    </ModalFlutuante>
  );
}
