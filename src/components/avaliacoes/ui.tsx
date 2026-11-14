"use client";

import { COR_ESTRELA, corDaNotaNps } from "@/lib/avaliacoes/marca";
import type { TipoPergunta } from "@/lib/avaliacoes/perguntas";

// Peças pequenas da tela Configurar das Avaliações (14/11/2026).

export const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm focus:border-azul-petroleo focus:outline-none";
export const ROTULO = "text-xs font-semibold text-cinza-medio";
export const BOTAO_PRIMARIO = "rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-50";
export const BOTAO_SECUNDARIO = "rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm font-semibold text-azul-noite hover:border-azul-petroleo disabled:opacity-40";
export const CARTAO = "flex flex-col gap-3 rounded-xl border border-cinza-claro bg-branco p-4 md:p-5";

/** Liga e desliga, com o texto do estado ao lado. */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  desabilitado,
  mostrarTexto = true,
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
  desabilitado?: boolean;
  mostrarTexto?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      className="inline-flex shrink-0 items-center gap-2 disabled:opacity-50"
    >
      <span className={`relative inline-block h-6 w-11 rounded-full transition-colors ${ligado ? "bg-verde" : "bg-cinza-claro"}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ligado ? "left-[22px]" : "left-0.5"}`} />
      </span>
      {mostrarTexto && <span className={`text-xs font-semibold ${ligado ? "text-verde" : "text-cinza-medio"}`}>{ligado ? "Ligada" : "Desligada"}</span>}
    </button>
  );
}

export const NOME_TIPO: Record<TipoPergunta, string> = {
  estrelas: "Estrelas de 1 a 5",
  simnao: "Sim ou não",
  atendente: "Lista de quem atende",
  faixas: "Faixas de tempo",
  nps: "Nota de 0 a 10",
  escolha: "Lista de opções",
  texto: "Texto livre",
};

function Estrela({ cheia }: { cheia: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={cheia ? COR_ESTRELA : "none"} stroke={cheia ? COR_ESTRELA : "#9CA3AF"} strokeWidth="1.6" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  );
}

/** Miniatura da resposta, como o cliente vê (só ilustração). */
export function MiniResposta({ tipo, opcoes, chave }: { tipo: TipoPergunta; opcoes?: readonly string[]; chave?: string }) {
  if (tipo === "estrelas") {
    return (
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Estrela key={n} cheia={n <= 4} />
        ))}
      </span>
    );
  }
  if (tipo === "nps") {
    return (
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 11 }, (_, n) => (
          <span key={n} className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold" style={{ border: `1.5px solid ${corDaNotaNps(n).fundo}`, color: corDaNotaNps(n).fundo }}>
            {n}
          </span>
        ))}
      </span>
    );
  }
  const pilulas =
    tipo === "simnao"
      ? chave === "pedido_certo"
        ? ["Sim, veio tudo certo", "Não, faltou ou veio errado"]
        : ["Sim", "Não"]
      : tipo === "atendente"
        ? ["Nomes de quem atende", "Não lembro o nome"]
        : (opcoes ?? []).slice(0, 5);
  if (tipo === "texto") {
    return <span className="block h-8 w-full max-w-xs rounded-md border border-dashed border-cinza-claro bg-off-white" aria-hidden="true" />;
  }
  return (
    <span className="flex flex-wrap gap-1" aria-hidden="true">
      {pilulas.map((p) => (
        <span key={p} className="rounded-full border border-cinza-claro bg-off-white px-2 py-0.5 text-[11px] text-cinza">
          {p}
        </span>
      ))}
      {(opcoes?.length ?? 0) > 5 && <span className="px-1 text-[11px] text-cinza-medio">+{(opcoes?.length ?? 0) - 5}</span>}
    </span>
  );
}
