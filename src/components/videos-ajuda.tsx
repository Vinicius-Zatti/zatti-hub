"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { VIDEOS_AJUDA, type IdVideoAjuda } from "@/lib/videos-ajuda/regras";

// Vídeos explicativos dentro do app (26/10/2026). Um player só para o shell da
// Navegação V2, no mesmo `ModalFlutuante` do convite de instalar (PR #56):
// abre pelo cartão de boas-vindas (primeiro acesso, `navegacao-v2/tour-modulo.tsx`),
// pelo item "Vídeo de boas-vindas" do menu e pelo link do começo da Contagem.
// Nunca toca sozinho (`preload="none"`, sem autoplay).

const AbrirVideoContexto = createContext<((id: IdVideoAjuda) => void) | null>(null);

/** Abre o player do vídeo; null fora do shell da Navegação V2 (aí o atalho não aparece). */
export function useAbrirVideoAjuda() {
  return useContext(AbrirVideoContexto);
}

export function VideosAjudaProvider({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState<IdVideoAjuda | null>(null);
  const abrir = useCallback((id: IdVideoAjuda) => setAberto(id), []);
  const video = aberto ? VIDEOS_AJUDA[aberto] : null;

  return (
    <AbrirVideoContexto.Provider value={abrir}>
      {children}
      <ModalFlutuante aberto={video !== null} onFechar={() => setAberto(null)}>
        {video && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-azul-noite">{video.titulo}</h2>
              <button
                type="button"
                onClick={() => setAberto(null)}
                className="min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-cinza-medio transition-colors hover:bg-branco hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
              >
                Fechar o vídeo
              </button>
            </div>
            <video
              key={video.src}
              src={video.src}
              poster={video.capa}
              controls
              playsInline
              preload="none"
              className="mx-auto mt-3 max-h-[72vh] w-auto max-w-full rounded-xl bg-azul-noite"
            >
              Seu navegador não abriu o vídeo.
            </video>
          </>
        )}
      </ModalFlutuante>
    </AbrirVideoContexto.Provider>
  );
}

/** Cartão do primeiro acesso, oferecido uma vez (quem decide é o `TourModuloProvider`). */
export function CartaoBoasVindas({ aoFechar }: { aoFechar: () => void }) {
  const abrirVideo = useAbrirVideoAjuda();
  const video = VIDEOS_AJUDA["boas-vindas"];
  return (
    <section
      data-cartao-boas-vindas=""
      aria-labelledby="cartao-boas-vindas-titulo"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-cinza-claro bg-branco p-4 text-azul-noite shadow-xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[22rem]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ambar/15 text-azul-noite">
          <IconePlay />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="cartao-boas-vindas-titulo" className="text-[15px] font-bold leading-snug">
            Assista ao vídeo de boas-vindas ({video.duracao})
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-cinza">
            Um passeio rápido pelo Zatti Hub: menu, busca, contagem e cotação.
          </p>
        </div>
      </div>
      <div className="mt-3.5">
        <button
          type="button"
          onClick={() => {
            aoFechar();
            abrirVideo?.("boas-vindas");
          }}
          className="min-h-11 w-full rounded-lg bg-azul-noite px-4 text-sm font-semibold text-branco transition-colors hover:bg-azul-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar focus-visible:ring-offset-2"
        >
          Ver o vídeo
        </button>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="px-2 text-xs text-cinza-medio">Fica no Menu para ver depois.</p>
          <button
            type="button"
            onClick={aoFechar}
            className="min-h-10 shrink-0 rounded-lg px-2 text-sm font-semibold text-cinza-medio transition-colors hover:bg-off-white hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
          >
            Agora não
          </button>
        </div>
      </div>
    </section>
  );
}

/** Item fixo do Menu (gaveta do celular e menu lateral): o vídeo de boas-vindas sempre à mão. */
export function ItemMenuVideoBoasVindas({
  aoAbrir,
  classeRotulo,
  classeAlinhamento,
}: {
  /** Fecha a gaveta do celular antes de abrir o vídeo. */
  aoAbrir: () => void;
  /** Some com o menu recolhido no desktop (só o ícone fica). */
  classeRotulo: string;
  classeAlinhamento: string;
}) {
  const abrirVideo = useAbrirVideoAjuda();
  if (!abrirVideo) return null;
  return (
    <button
      type="button"
      onClick={() => {
        aoAbrir();
        abrirVideo("boas-vindas");
      }}
      aria-label={`Ver o vídeo de boas-vindas (${VIDEOS_AJUDA["boas-vindas"].duracao})`}
      title={`Ver o vídeo de boas-vindas (${VIDEOS_AJUDA["boas-vindas"].duracao})`}
      className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:min-h-10 ${classeAlinhamento}`}
    >
      <IconePlay />
      <span className={classeRotulo}>Vídeo de boas-vindas</span>
    </button>
  );
}

/** Começo da Contagem: o (?) do cabeçalho só reabre o tour, então o vídeo fica num link discreto. */
export function LinkVideoContagem() {
  const abrirVideo = useAbrirVideoAjuda();
  if (!abrirVideo) return null;
  return (
    <button
      type="button"
      onClick={() => abrirVideo("contagem")}
      className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-azul-petroleo underline decoration-ambar underline-offset-4 transition-colors hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
    >
      <IconePlay className="h-4 w-4" />
      Como contar? Ver o vídeo ({VIDEOS_AJUDA.contagem.duracao})
    </button>
  );
}

export function IconePlay({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m10 9.2 4.8 2.8-4.8 2.8Z" />
    </svg>
  );
}
