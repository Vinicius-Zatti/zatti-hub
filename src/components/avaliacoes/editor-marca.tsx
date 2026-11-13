"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { DicaCalculo } from "@/components/dica-calculo";
import { salvarMarcaAction } from "@/app/(app)/avaliacoes/actions";
import { CONTRASTE_MINIMO, LIMITE_AGRADECIMENTO, LIMITE_NOME, contraste, corTextoSobre, normalizarCor, textoContraste } from "@/lib/avaliacoes/marca";

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

const DICA_CONTRASTE = `Contraste entre a cor principal e a de fundo, de 1 (iguais) a 21 (preto no branco), pela fórmula da WCAG: (luminância da mais clara + 0,05) dividido por (luminância da mais escura + 0,05). Abaixo de ${CONTRASTE_MINIMO} os botões e as notas escolhidas somem no fundo, por isso não salva. O texto sai sempre em preto ou branco, o que contrastar mais.`;

/** Nome exibido, cores, agradecimento, link do Google e pausa, num modal com prévia. */
export function EditorMarca({ atual }: { atual: MarcaAtual }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ ...atual, linkGoogle: atual.linkGoogle ?? "" });

  const principal = normalizarCor(form.corPrincipal);
  const fundo = normalizarCor(form.corFundo);
  const c = principal && fundo ? contraste(principal, fundo) : null;
  const contrasteOk = c !== null && c >= CONTRASTE_MINIMO;

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
                <CampoCor rotulo="Cor principal (botões)" valor={form.corPrincipal} aoMudar={(v) => setForm({ ...form, corPrincipal: v })} />
                <CampoCor rotulo="Cor de fundo" valor={form.corFundo} aoMudar={(v) => setForm({ ...form, corFundo: v })} />
              </div>
              <p className={`flex items-center gap-1 text-xs ${contrasteOk ? "text-cinza-medio" : "font-semibold text-vermelho"}`}>
                Contraste {c === null ? "-" : textoContraste(c)} {contrasteOk ? "(bom)" : `(mínimo ${CONTRASTE_MINIMO})`}
                <DicaCalculo rotulo="contraste" texto={DICA_CONTRASTE} />
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
            <button type="submit" disabled={pendente || !contrasteOk} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
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

/** Miniatura da página pública com as cores escolhidas. */
export function Previa({ nome, principal, fundo }: { nome: string; principal: string | null; fundo: string | null }) {
  if (!principal || !fundo) return <div className="rounded-lg border border-dashed border-cinza-claro p-4 text-sm text-cinza-medio">Prévia aparece com as duas cores válidas.</div>;
  const texto = corTextoSobre(fundo);
  const textoBotao = corTextoSobre(principal);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-cinza-claro p-4" style={{ backgroundColor: fundo, color: texto }} aria-label="Prévia da página">
      <p className="text-center text-base font-bold">{nome || "Nome"}</p>
      <p className="text-sm font-semibold">Como foi o atendimento?</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <svg key={n} viewBox="0 0 24 24" className="h-7 w-7" fill={n <= 4 ? principal : "none"} stroke={principal} strokeWidth="1.6" aria-hidden="true">
            <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </svg>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="rounded-lg border-2 px-2 py-2 text-center" style={{ backgroundColor: principal, borderColor: principal, color: textoBotao }}>
          Até 15 min
        </span>
        <span className="rounded-lg border-2 px-2 py-2 text-center" style={{ borderColor: `${texto}4D` }}>
          De 15 a 30 min
        </span>
      </div>
      <span className="rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ backgroundColor: principal, color: textoBotao }}>
        Enviar avaliação
      </span>
    </div>
  );
}
