"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ModalFlutuante } from "@/components/modal-flutuante";
import {
  CHAVE_INSTALADO,
  CHAVE_RECUSA,
  deveMostrarConvite,
  detectarPlataforma,
  EVENTO_PROMPT_PRONTO,
  lerRecusa,
  modoConvite,
  type Plataforma,
} from "@/lib/instalar-app/regras";

// Convite para instalar o Zatti Hub como app (26/10/2026). Só no celular ou
// tablet, só logado (vive no layout da área logada) e só fora do app
// instalado. Regras em `lib/instalar-app/regras.ts`; o pedido de instalação
// do Chrome é guardado pelo script do <head> (`SCRIPT_CAPTURA_INSTALACAO`).
// Não empilha com o tour, modal, busca nem tela em modo foco: espera a tela
// assentar (o tour abre em 0,8 s) e some enquanto qualquer um deles estiver aberto.

const ESPERA_ABRIR_MS = 2500;
const BLOQUEIOS = "[aria-modal='true'], [data-modal-flutuante], [data-modo-foco]";

type PromptInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __zattiPromptInstalar?: PromptInstalacao | null;
  }
}

const VIDEOS = {
  ios: { src: "/videos/zatti-hub-como-app-no-celular-iphone.mp4", capa: "/videos/zatti-hub-como-app-no-celular-iphone-capa.jpg", duracao: "45s" },
  android: {
    src: "/videos/zatti-hub-como-app-no-celular-android.mp4",
    capa: "/videos/zatti-hub-como-app-no-celular-android-capa.jpg",
    duracao: "43s",
  },
} as const;

const PASSOS = {
  ios: [
    "Toque no botão de compartilhar (o quadrado com a seta para cima).",
    "Toque em “Adicionar à Tela de Início”. Não achou? Toque em “Ver Mais” e role a lista.",
    "Toque em “Adicionar”.",
  ],
  android: [
    "Toque nos três pontinhos, no canto de cima do navegador.",
    "Toque em “Instalar app” ou “Adicionar à tela inicial”.",
    "Confirme em “Instalar” ou “Adicionar”.",
  ],
} as const;

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Navegação privada ou armazenamento cheio: só esta visita fica sem lembrar.
  }
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function rodandoInstalado(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function haBloqueio(): boolean {
  return Array.from(document.querySelectorAll(BLOQUEIOS)).some((el) => !el.closest("[data-convite-instalar]"));
}

export function ConviteInstalarApp({ comBarraInferior }: { comBarraInferior: boolean }) {
  // null = não mostra (computador, instalado, recusado ou ainda esperando a tela assentar).
  const [plataforma, setPlataforma] = useState<Exclude<Plataforma, "computador"> | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [temPrompt, setTemPrompt] = useState(false);
  const [videoAberto, setVideoAberto] = useState(false);
  const elegivel = plataforma !== null;

  // Decide depois que a tela assenta (só no navegador: localStorage e user agent).
  useEffect(() => {
    const espera = window.setTimeout(() => {
      const p = detectarPlataforma(navigator.userAgent, navigator.maxTouchPoints ?? 0);
      const standalone = rodandoInstalado();
      if (standalone) gravar(CHAVE_INSTALADO, "1");
      const mostrar = deveMostrarConvite({
        plataforma: p,
        standalone,
        instalado: ler(CHAVE_INSTALADO) === "1",
        recusadoEm: lerRecusa(ler(CHAVE_RECUSA)),
        agora: Date.now(),
      });
      if (!mostrar || p === "computador") return;
      setTemPrompt(Boolean(window.__zattiPromptInstalar));
      setBloqueado(haBloqueio());
      setPlataforma(p);
    }, ESPERA_ABRIR_MS);
    return () => window.clearTimeout(espera);
  }, []);

  // Pedido do Chrome chegou depois (ou o app foi instalado por fora).
  useEffect(() => {
    if (!elegivel) return;
    const atualizar = () => {
      if (ler(CHAVE_INSTALADO) === "1") setPlataforma(null);
      setTemPrompt(Boolean(window.__zattiPromptInstalar));
    };
    window.addEventListener(EVENTO_PROMPT_PRONTO, atualizar);
    return () => window.removeEventListener(EVENTO_PROMPT_PRONTO, atualizar);
  }, [elegivel]);

  // Tour, modal, busca ou modo foco na tela: o cartão espera (o vídeo do próprio cartão não conta).
  useEffect(() => {
    if (!elegivel) return;
    const observador = new MutationObserver(() => setBloqueado(haBloqueio()));
    observador.observe(document.body, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [elegivel]);

  const agoraNao = useCallback(() => {
    gravar(CHAVE_RECUSA, String(Date.now()));
    setPlataforma(null);
  }, []);

  const jaInstalei = useCallback(() => {
    gravar(CHAVE_INSTALADO, "1");
    setPlataforma(null);
  }, []);

  const instalar = useCallback(async () => {
    const pedido = window.__zattiPromptInstalar;
    if (!pedido) {
      setTemPrompt(false);
      return;
    }
    // O Chrome só deixa usar o pedido uma vez.
    window.__zattiPromptInstalar = null;
    try {
      await pedido.prompt();
      const { outcome } = await pedido.userChoice;
      if (outcome === "accepted") gravar(CHAVE_INSTALADO, "1");
      else gravar(CHAVE_RECUSA, String(Date.now()));
      setPlataforma(null);
    } catch {
      setTemPrompt(false);
    }
  }, []);

  if (!plataforma) return null;
  if (bloqueado && !videoAberto) return null;

  const modo = modoConvite(plataforma, temPrompt);
  const sistema = plataforma === "ios" ? "ios" : "android";
  const video = VIDEOS[sistema];

  return (
    <div data-convite-instalar="">
      <section
        aria-labelledby="convite-instalar-titulo"
        className={`fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl border border-cinza-claro bg-branco p-4 text-azul-noite shadow-xl lg:hidden ${
          comBarraInferior ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(0.75rem+env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="flex items-start gap-3">
          <Image src="/icones/icone-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 id="convite-instalar-titulo" className="text-[15px] font-bold leading-snug">
              Deixe o Zatti Hub como app no celular
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-cinza">
              Um ícone na sua tela que abre direto, em tela cheia, sem procurar o site.
            </p>
          </div>
        </div>

        {modo !== "botao-nativo" && (
          <ol className="mt-3 space-y-1.5 text-sm leading-snug text-cinza">
            {PASSOS[sistema].map((passo, i) => (
              <li key={passo} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ambar text-[11px] font-bold text-azul-noite">
                  {i + 1}
                </span>
                <span>{passo}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Ação principal em largura cheia; as secundárias embaixo (cabe em 360px). */}
        <div className="mt-3.5">
          {modo === "botao-nativo" ? (
            <button type="button" onClick={() => void instalar()} className="min-h-11 w-full rounded-lg bg-azul-noite px-4 text-sm font-semibold text-branco transition-colors hover:bg-azul-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar focus-visible:ring-offset-2">
              Instalar o Zatti Hub no celular
            </button>
          ) : (
            <button type="button" onClick={() => setVideoAberto(true)} className="min-h-11 w-full rounded-lg bg-azul-noite px-4 text-sm font-semibold text-branco transition-colors hover:bg-azul-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar focus-visible:ring-offset-2">
              Ver o vídeo de {video.duracao}
            </button>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            {modo !== "botao-nativo" ? (
              <button
                type="button"
                onClick={jaInstalei}
                className="min-h-10 rounded-lg px-2 text-sm font-semibold text-cinza-medio transition-colors hover:bg-off-white hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
              >
                Já instalei
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={agoraNao}
              className="min-h-10 rounded-lg px-2 text-sm font-semibold text-cinza-medio transition-colors hover:bg-off-white hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
            >
              Agora não
            </button>
          </div>
        </div>
      </section>

      <ModalFlutuante aberto={videoAberto} onFechar={() => setVideoAberto(false)}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-azul-noite">Como deixar o Zatti Hub como app</h2>
          <button
            type="button"
            onClick={() => setVideoAberto(false)}
            className="min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-cinza-medio transition-colors hover:bg-branco hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
          >
            Fechar o vídeo
          </button>
        </div>
        <video
          src={video.src}
          poster={video.capa}
          controls
          playsInline
          preload="none"
          className="mx-auto mt-3 max-h-[72vh] w-auto max-w-full rounded-xl bg-azul-noite"
        >
          Seu navegador não abriu o vídeo. Siga os passos do cartão.
        </video>
      </ModalFlutuante>
    </div>
  );
}
