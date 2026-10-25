"use client";

import { useState, useTransition } from "react";
import { definirModuloAction } from "@/app/(app)/configuracoes/actions";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { avisoDesligar, type EstadoModulo } from "@/lib/configuracoes/modulos";

/** Lista de Configurações > Módulos. O botão só aparece para master
 * (`alteravel`); a barreira real é `requireMaster()` na action. Desligar pede
 * confirmação antes; o rótulo do botão diz o efeito. */
export function ListaModulos({ modulos }: { modulos: EstadoModulo[] }) {
  const [confirmando, setConfirmando] = useState<EstadoModulo | null>(null);
  const [pendente, startTransition] = useTransition();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<{ chave: string; texto: string } | null>(null);

  function aplicar(modulo: EstadoModulo, ligar: boolean) {
    setErro(null);
    setEmAndamento(modulo.chave);
    startTransition(async () => {
      const r = await definirModuloAction(modulo.chave, ligar);
      if ("erro" in r) setErro({ chave: modulo.chave, texto: r.erro });
      setEmAndamento(null);
      setConfirmando(null);
    });
  }

  return (
    <>
      <ul aria-label="Módulos da unidade" className="grid gap-2.5 lg:grid-cols-2">
        {modulos.map((m) => {
          const salvando = pendente && emAndamento === m.chave;
          return (
            <li key={m.chave} className="flex flex-col gap-2 rounded-2xl border border-cinza-claro bg-branco p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-azul-noite">{m.nome}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    m.ligado ? "bg-verde/10 text-verde" : "bg-cinza-claro text-cinza-medio"
                  }`}
                >
                  {m.ligadoPor === null ? "Sempre ligado" : m.ligado ? "Ligado" : "Desligado"}
                </span>
              </div>
              <p className="text-[13px] text-cinza-medio">{m.descricao}</p>
              {m.observacao && <p className="text-xs font-semibold text-ambar">{m.observacao}</p>}
              {m.alteravel && (
                <div>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => (m.ligado ? setConfirmando(m) : aplicar(m, true))}
                    className={`min-h-10 rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
                      m.ligado
                        ? "border-vermelho text-vermelho hover:bg-vermelho/10"
                        : "border-azul-petroleo text-azul-petroleo hover:bg-azul-petroleo/10"
                    }`}
                  >
                    {salvando ? "Salvando..." : m.ligado ? `Desligar ${m.nome}` : `Ligar ${m.nome}`}
                  </button>
                </div>
              )}
              {erro?.chave === m.chave && <p className="text-xs text-vermelho">{erro.texto}</p>}
            </li>
          );
        })}
      </ul>

      <ModalFlutuante aberto={confirmando !== null} onFechar={() => !pendente && setConfirmando(null)}>
        {confirmando && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-bold text-azul-noite">Desligar {confirmando.nome}?</h2>
            <p className="text-sm text-azul-noite">{avisoDesligar(confirmando)}</p>
            <p className="text-xs text-cinza-medio">Dá para ligar de novo depois, aqui mesmo.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pendente}
                onClick={() => setConfirmando(null)}
                className="min-h-11 rounded-md border border-cinza-claro bg-branco px-4 py-2 text-sm font-semibold text-azul-noite disabled:opacity-40"
              >
                Manter ligado
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => aplicar(confirmando, false)}
                className="min-h-11 rounded-md bg-vermelho px-4 py-2 text-sm font-semibold text-branco disabled:opacity-40"
              >
                {pendente ? "Desligando..." : `Desligar ${confirmando.nome}`}
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </>
  );
}
