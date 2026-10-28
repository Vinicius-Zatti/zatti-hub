"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { definirModuloAction } from "@/app/(app)/configuracoes/actions";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { avisoDesligar, type EstadoModulo } from "@/lib/configuracoes/modulos";

/** Lista de Configurações > Módulos. O botão só aparece para quem pode trocar
 * (`alteravel`: master; dono e gestão só na Contagem por setor); a barreira
 * real é a action. Desligar pede confirmação antes, e ligar também quando há
 * aviso (`avisoLigar`); o rótulo do botão diz o efeito. Com `bloqueio`, o
 * botão fica desabilitado e o motivo aparece no cartão. */
export function ListaModulos({ modulos }: { modulos: EstadoModulo[] }) {
  const [confirmando, setConfirmando] = useState<{ modulo: EstadoModulo; ligar: boolean } | null>(null);
  const [pendente, startTransition] = useTransition();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<{ chave: string; texto: string } | null>(null);

  function aplicar(modulo: EstadoModulo, ligar: boolean) {
    setErro(null);
    setEmAndamento(modulo.chave);
    startTransition(async () => {
      // try/finally: se a action falhar (rede, sessão vencida), o botão não
      // fica preso em "Salvando..." e o modal fecha com o erro no cartão.
      try {
        const r = await definirModuloAction(modulo.chave, ligar);
        if ("erro" in r) setErro({ chave: modulo.chave, texto: r.erro });
      } catch {
        setErro({ chave: modulo.chave, texto: "Não foi possível salvar agora. Tente de novo em instantes." });
      } finally {
        setEmAndamento(null);
        setConfirmando(null);
      }
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
              {m.alteravel && m.bloqueio && <p className="text-xs font-semibold text-ambar">{m.bloqueio}</p>}
              {m.alteravel && (
                <div>
                  <button
                    type="button"
                    disabled={pendente || Boolean(m.bloqueio)}
                    onClick={() =>
                      m.ligado || m.avisoLigar ? setConfirmando({ modulo: m, ligar: !m.ligado }) : aplicar(m, true)
                    }
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
            <h2 className="font-display text-lg font-bold text-azul-noite">
              {confirmando.ligar ? "Ligar" : "Desligar"} {confirmando.modulo.nome}?
            </h2>
            {confirmando.ligar ? (
              <p className="text-sm text-azul-noite">
                {confirmando.modulo.avisoLigar?.texto}
                {confirmando.modulo.avisoLigar?.link && (
                  <>
                    {" "}
                    <Link
                      href={confirmando.modulo.avisoLigar.link.href}
                      className="font-semibold text-azul-petroleo underline"
                    >
                      {confirmando.modulo.avisoLigar.link.rotulo}
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-azul-noite">{avisoDesligar(confirmando.modulo)}</p>
            )}
            <p className="text-xs text-cinza-medio">
              {confirmando.ligar ? "Dá para desligar depois, aqui mesmo." : "Dá para ligar de novo depois, aqui mesmo."}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pendente}
                onClick={() => setConfirmando(null)}
                className="min-h-11 rounded-md border border-cinza-claro bg-branco px-4 py-2 text-sm font-semibold text-azul-noite disabled:opacity-40"
              >
                {confirmando.ligar ? "Manter desligado" : "Manter ligado"}
              </button>
              <button
                type="button"
                disabled={pendente}
                onClick={() => aplicar(confirmando.modulo, confirmando.ligar)}
                className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold text-branco disabled:opacity-40 ${
                  confirmando.ligar ? "bg-azul-petroleo" : "bg-vermelho"
                }`}
              >
                {pendente
                  ? confirmando.ligar
                    ? "Ligando..."
                    : "Desligando..."
                  : `${confirmando.ligar ? "Ligar" : "Desligar"} ${confirmando.modulo.nome}`}
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </>
  );
}
