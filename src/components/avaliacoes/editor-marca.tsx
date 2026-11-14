"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarMarcaParcialAction } from "@/app/(app)/avaliacoes/actions";
import { COR_ESTRELA, contraste, corTextoSobre, normalizarCor } from "@/lib/avaliacoes/marca";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, ROTULO } from "./ui";

/** Cores da página (principal e fundo), com a prévia ao lado mudando junto e o próprio "Salvar". */
export function EditorCores({ nome, principal, fundo, podeEditar }: { nome: string; principal: string; fundo: string; podeEditar: boolean }) {
  const router = useRouter();
  const [cores, setCores] = useState({ principal, fundo });
  const [base, setBase] = useState({ principal, fundo });
  if (base.principal !== principal || base.fundo !== fundo) {
    setBase({ principal, fundo });
    setCores({ principal, fundo });
  }
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);
  const p = normalizarCor(cores.principal);
  const f = normalizarCor(cores.fundo);
  const mudou = cores.principal.toUpperCase() !== principal.toUpperCase() || cores.fundo.toUpperCase() !== fundo.toUpperCase();

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-3">
        {podeEditar ? (
          <>
            <CampoCor rotulo="Cor principal" ajuda="Capa e faixa do topo. Use a cor forte da marca." valor={cores.principal} aoMudar={(v) => setCores({ ...cores, principal: v })} />
            <CampoCor rotulo="Cor de fundo" ajuda="Fundo das perguntas. Clara (ou bem escura) deixa a leitura fácil." valor={cores.fundo} aoMudar={(v) => setCores({ ...cores, fundo: v })} />
            <p className="text-xs text-cinza-medio">Textos e botões saem sozinhos em preto ou branco, o que ficar mais legível em cada cor.</p>
            {mudou && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pendente || !p || !f}
                  onClick={() => {
                    setAviso(null);
                    startTransition(async () => {
                      const r = await salvarMarcaParcialAction({ corPrincipal: cores.principal, corFundo: cores.fundo });
                      if ("erro" in r) return setAviso({ erro: true, texto: r.erro });
                      setAviso({ erro: false, texto: "Cores salvas." });
                      router.refresh();
                    });
                  }}
                  className={BOTAO_PRIMARIO}
                >
                  {pendente ? "Salvando..." : "Salvar as cores"}
                </button>
                <button type="button" disabled={pendente} onClick={() => setCores({ principal, fundo })} className={BOTAO_SECUNDARIO}>
                  Desfazer
                </button>
              </div>
            )}
            {aviso && <p className={`text-xs font-semibold ${aviso.erro ? "text-vermelho" : "text-verde"}`}>{aviso.texto}</p>}
          </>
        ) : (
          <p className="text-sm text-cinza">
            Principal {principal} · fundo {fundo}
          </p>
        )}
      </div>
      <Previa nome={nome} principal={p} fundo={f} />
    </div>
  );
}

/** Pesquisa no ar ou pausada (QR mostra um aviso de pausa), com confirmação para pausar. */
export function PausaPesquisa({ ativa, podeEditar }: { ativa: boolean; podeEditar: boolean }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function mudar(nova: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await salvarMarcaParcialAction({ ativa: nova });
      if ("erro" in r) return setErro(r.erro);
      setConfirmar(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${ativa ? "bg-verde/10 text-verde" : "bg-ambar/15 text-ambar"}`}>
        <span className={`h-2 w-2 rounded-full ${ativa ? "bg-verde" : "bg-ambar"}`} aria-hidden="true" />
        {ativa ? "Pesquisa no ar" : "Pesquisa pausada"}
      </span>
      {podeEditar &&
        (ativa ? (
          <button type="button" onClick={() => setConfirmar(true)} className="text-xs font-semibold text-cinza underline hover:text-azul-noite">
            Pausar
          </button>
        ) : (
          <button type="button" disabled={pendente} onClick={() => mudar(true)} className={BOTAO_PRIMARIO}>
            {pendente ? "Ligando..." : "Pôr no ar de novo"}
          </button>
        ))}
      {erro && !confirmar && <span className="text-xs text-vermelho">{erro}</span>}
      <ModalFlutuante aberto={confirmar} onFechar={() => !pendente && setConfirmar(false)}>
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">Pausar a pesquisa?</h2>
          <ul className="list-disc pl-5 text-sm text-cinza">
            <li>Quem ler o QR vê um aviso de pesquisa pausada e não consegue responder.</li>
            <li>Nada é apagado: perguntas, respostas e QR impresso continuam iguais. Para voltar, toque em &quot;Pôr no ar de novo&quot;.</li>
          </ul>
          {erro && <p className="text-sm text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={pendente} onClick={() => mudar(false)} className="rounded-md bg-ambar px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
              {pendente ? "Pausando..." : "Pausar a pesquisa"}
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </div>
      </ModalFlutuante>
    </div>
  );
}

function CampoCor({ rotulo, ajuda, valor, aoMudar }: { rotulo: string; ajuda: string; valor: string; aoMudar: (v: string) => void }) {
  const cor = normalizarCor(valor) ?? "#FFFFFF";
  return (
    <label className={ROTULO}>
      <span className="text-sm text-azul-noite">{rotulo}</span>
      <span className="block font-normal">{ajuda}</span>
      <span className="mt-1 flex items-center gap-2">
        <input type="color" value={cor.toLowerCase()} onChange={(e) => aoMudar(e.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded border border-cinza-claro" aria-label={rotulo} />
        <input className="w-32 rounded-md border border-cinza-claro bg-branco px-2 py-2 font-mono text-sm uppercase" value={valor} maxLength={7} onChange={(e) => aoMudar(e.target.value)} />
      </span>
    </label>
  );
}

/** Miniatura da página pública: a capa e uma pergunta, com as cores escolhidas. */
export function Previa({ nome, principal, fundo }: { nome: string; principal: string | null; fundo: string | null }) {
  if (!principal || !fundo) return <div className="rounded-lg border border-dashed border-cinza-claro p-4 text-sm text-cinza-medio">Prévia aparece com as duas cores válidas.</div>;
  const textoCapa = corTextoSobre(principal);
  const tinta = corTextoSobre(fundo);
  const textoBotao = contraste(principal, tinta) >= 3 ? principal : fundo;
  return (
    <div className="grid grid-cols-2 gap-2" aria-label="Prévia da página">
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg p-3 text-center" style={{ backgroundColor: principal, color: textoCapa }}>
        <span className="h-12 w-12 rounded-full bg-white" aria-hidden="true" />
        <p className="text-sm font-extrabold leading-tight">Como foi sua experiência na {nome || "Nome"}?</p>
        <span className="mt-1 w-full rounded-md px-2 py-1.5 text-xs font-bold" style={{ backgroundColor: textoCapa, color: principal }}>
          Começar avaliação
        </span>
      </div>
      <div className="flex min-h-[220px] flex-col overflow-hidden rounded-lg border border-cinza-claro" style={{ backgroundColor: fundo, color: tinta }}>
        <div className="h-6" style={{ backgroundColor: principal }} aria-hidden="true" />
        <div className="flex flex-1 flex-col gap-2 p-3">
          <p className="text-xs font-bold leading-tight">Como você avalia o nosso atendimento?</p>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <svg key={n} viewBox="0 0 24 24" className="h-5 w-5" fill={n <= 4 ? COR_ESTRELA : "none"} stroke={n <= 4 ? COR_ESTRELA : `${tinta}40`} strokeWidth="1.6" aria-hidden="true">
                <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
              </svg>
            ))}
          </div>
          <span className="mt-auto rounded-md px-2 py-1.5 text-center text-xs font-bold" style={{ backgroundColor: tinta, color: textoBotao }}>
            Continuar
          </span>
        </div>
      </div>
    </div>
  );
}
