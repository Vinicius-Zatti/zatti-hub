"use client";

import type { PosicaoMontada } from "@/lib/escritorio/escritorio";
import { AVISO_ARQUETIPO } from "@/lib/escritorio/ocupantes";
import type { Nivel } from "@/lib/escritorio/tipos";
import { ROTULO_NIVEL, SITUACAO, dataBr } from "./rotulos";
import { Avatar } from "./sala-escritorio";

const NIVEIS: Nivel[] = ["definido", "processo", "operacional"];

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-cinza-medio">{titulo}</h3>
      <div className="mt-1 text-sm text-cinza">{children}</div>
    </div>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {itens.map((i) => <li key={i}>{i}</li>)}
    </ul>
  );
}

export function DetalhePosicao({ posicao, salaNome, aoFechar }: { posicao: PosicaoMontada; salaNome: string; aoFechar: () => void }) {
  const { responsabilidade: r, estado } = posicao;
  const vaga = posicao.ocupanteId === null;
  const situacao = SITUACAO[estado.situacao];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg bg-azul-noite p-3 text-branco">
        <Avatar posicao={posicao} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold leading-tight">{posicao.cargo}</h2>
          <p className="text-xs text-branco/70">{salaNome}</p>
          <p className="mt-1 text-sm">{vaga ? "Posição vaga - ainda sem ocupante definido" : `Ocupada por ${posicao.ocupante?.nome}`}</p>
        </div>
        <button type="button" onClick={aoFechar} className="rounded-md px-2 py-1 text-sm text-branco/70 hover:text-branco" aria-label="Fechar">
          ✕
        </button>
      </div>

      {posicao.arquetipo && (
        <Bloco titulo="Inspirado em">
          <p>{posicao.arquetipo.nome}</p>
          <p className="text-xs text-cinza-medio">{AVISO_ARQUETIPO}</p>
        </Bloco>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Bloco titulo="Situação">
          <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${situacao.ponto}`} />{situacao.rotulo}</span>
          {estado.motivo && <p className="mt-1 text-xs text-cinza-medio">{estado.motivo}</p>}
        </Bloco>
        <Bloco titulo="Responde a">{posicao.reportaACargo ?? "Topo da estrutura"}</Bloco>
      </div>

      <Bloco titulo="Nível atual">
        {estado.nivel === null ? (
          <p>{vaga ? "Sem nível: posição vaga." : "Não se aplica: ocupada por pessoa."}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {NIVEIS.map((n) => {
              const alcancado = NIVEIS.indexOf(n) <= NIVEIS.indexOf(estado.nivel as Nivel);
              return (
                <span key={n} className={`rounded px-1.5 py-1 text-center text-[11px] font-semibold ${alcancado ? "bg-ambar text-azul-noite" : "bg-cinza-claro text-cinza-medio"}`}>
                  {ROTULO_NIVEL[n]}
                </span>
              );
            })}
          </div>
        )}
        {estado.evidencia && <p className="mt-1 text-xs text-cinza-medio">Evidência: {estado.evidencia}</p>}
      </Bloco>

      <Bloco titulo="Missão"><p>{r.missao}</p></Bloco>
      <Bloco titulo="Responsabilidades"><Lista itens={r.responsabilidades} /></Bloco>
      <Bloco titulo="Assuntos que recebe">
        <div className="flex flex-wrap gap-1">
          {r.assuntos.map((a) => <span key={a} className="rounded-full bg-cinza-claro px-2 py-0.5 text-xs">{a}</span>)}
        </div>
      </Bloco>
      <Bloco titulo="Resultados esperados"><Lista itens={r.resultados} /></Bloco>

      {estado.entregas.length > 0 && (
        <Bloco titulo="Entregas registradas">
          <Lista itens={estado.entregas.map((e) => `${dataBr(e.data)} - ${e.descricao}`)} />
        </Bloco>
      )}
      {estado.alertas.length > 0 && (
        <Bloco titulo="Alertas"><Lista itens={estado.alertas} /></Bloco>
      )}
    </div>
  );
}
