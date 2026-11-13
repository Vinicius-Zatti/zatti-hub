"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarMarcaAction } from "@/app/(app)/avaliacoes/actions";
import { COR_ESTRELA, LIMITE_AGRADECIMENTO, LIMITE_NOME, contraste, corTextoSobre, normalizarCor } from "@/lib/avaliacoes/marca";

export type MarcaAtual = {
  nomeExibido: string;
  corPrincipal: string;
  corFundo: string;
  textoAgradecimento: string;
  linkGoogle: string | null;
  ativa: boolean;
};

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";

/** Nome exibido, cores, agradecimento, link do Google e pausa, num modal com prévia. */
export function EditorMarca({ atual }: { atual: MarcaAtual }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ ...atual, linkGoogle: atual.linkGoogle ?? "" });

  const principal = normalizarCor(form.corPrincipal);
  const fundo = normalizarCor(form.corFundo);

  function abrir() {
    setForm({ ...atual, linkGoogle: atual.linkGoogle ?? "" });
    setErro(null);
    setAberto(true);
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await salvarMarcaAction(form);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={abrir} className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10">
        Editar nome, cores e link do Google
      </button>
      <ModalFlutuante aberto={aberto} onFechar={() => !pendente && setAberto(false)} larga>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
          className="flex flex-col gap-3"
        >
          <h2 className="font-display text-lg font-bold text-azul-noite">Marca da pesquisa</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <label className={ROTULO}>
                Nome exibido na página
                <input className={CAMPO} value={form.nomeExibido} maxLength={LIMITE_NOME} onChange={(e) => setForm({ ...form, nomeExibido: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <CampoCor rotulo="Cor principal (capa e topo)" valor={form.corPrincipal} aoMudar={(v) => setForm({ ...form, corPrincipal: v })} />
                <CampoCor rotulo="Cor de fundo (perguntas)" valor={form.corFundo} aoMudar={(v) => setForm({ ...form, corFundo: v })} />
              </div>
              <p className="text-xs text-cinza-medio">
                Use a cor forte da marca como principal e uma cor clara (ou bem escura) de fundo. Textos e botões saem sozinhos em preto ou branco, o que ficar mais legível.
              </p>
              <label className={ROTULO}>
                Texto da tela de obrigado
                <textarea
                  className={CAMPO}
                  rows={2}
                  maxLength={LIMITE_AGRADECIMENTO}
                  value={form.textoAgradecimento}
                  onChange={(e) => setForm({ ...form, textoAgradecimento: e.target.value })}
                />
              </label>
              <label className={ROTULO}>
                Link para avaliar no Google (opcional)
                <input
                  className={CAMPO}
                  type="url"
                  inputMode="url"
                  placeholder="https://g.page/r/.../review"
                  value={form.linkGoogle}
                  onChange={(e) => setForm({ ...form, linkGoogle: e.target.value })}
                />
                <span className="mt-1 block font-normal">
                  No Perfil da Empresa no Google, toque em &quot;Pedir avaliações&quot; e copie o link. O botão aparece para todos na tela de obrigado, qualquer nota. Sem link,
                  sem botão.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!form.ativa} onChange={(e) => setForm({ ...form, ativa: !e.target.checked })} className="h-4 w-4" />
                Pausar a pesquisa (o QR abre um aviso de pausa e ninguém consegue responder)
              </label>
            </div>
            <Previa nome={form.nomeExibido} principal={principal} fundo={fundo} />
          </div>
          {erro && <p className="text-sm text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pendente || !principal || !fundo} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
              {pendente ? "Salvando..." : form.ativa ? "Salvar a marca da pesquisa" : "Salvar e pausar a pesquisa"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
              Cancelar
            </button>
          </div>
        </form>
      </ModalFlutuante>
    </>
  );
}

function CampoCor({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (v: string) => void }) {
  const cor = normalizarCor(valor) ?? "#FFFFFF";
  return (
    <label className={ROTULO}>
      {rotulo}
      <span className="mt-1 flex items-center gap-2">
        <input type="color" value={cor.toLowerCase()} onChange={(e) => aoMudar(e.target.value.toUpperCase())} className="h-9 w-10 shrink-0 cursor-pointer rounded border border-cinza-claro" aria-label={rotulo} />
        <input className="w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 font-mono text-sm uppercase" value={valor} maxLength={7} onChange={(e) => aoMudar(e.target.value)} />
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
