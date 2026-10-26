"use client";

import { useCallback, useState } from "react";
import { IconePlay, useAbrirVideoAjuda, VideosAjudaProvider } from "@/components/videos-ajuda";
import { agruparVideosPorSecao, ehVideoDeitado } from "@/lib/videos-ajuda/central";
import { VIDEOS_AJUDA, type IdVideoAjuda, type VideoAjuda } from "@/lib/videos-ajuda/regras";

// Central de Vídeos explicativos (26/10/2026): todos os vídeos de
// `VIDEOS_AJUDA`, por seção, abrindo no mesmo player do resto do app. No menu
// antigo (sem o player do shell da Navegação V2) a página monta o próprio.

export function CentralVideosAjuda() {
  const abrirDoShell = useAbrirVideoAjuda();
  if (abrirDoShell) return <ListaVideos abrir={abrirDoShell} />;
  return (
    <VideosAjudaProvider>
      <ListaComPlayerProprio />
    </VideosAjudaProvider>
  );
}

function ListaComPlayerProprio() {
  const abrir = useAbrirVideoAjuda();
  return abrir ? <ListaVideos abrir={abrir} /> : null;
}

function ListaVideos({ abrir }: { abrir: (id: IdVideoAjuda) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {agruparVideosPorSecao(VIDEOS_AJUDA).map((grupo) => (
        <section key={grupo.secao} aria-labelledby={`videos-${grupo.secao}`}>
          <h2 id={`videos-${grupo.secao}`} className="mb-2 text-sm font-bold uppercase tracking-wide text-cinza-medio">
            {grupo.secao}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {grupo.videos.map(({ id, video }) => (
              <li key={id}>
                <CartaoVideo video={video} aoAbrir={() => abrir(id)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CartaoVideo({ video, aoAbrir }: { video: VideoAjuda; aoAbrir: () => void }) {
  // A orientação vem da própria capa: vídeo novo não precisa marcar nada.
  const [deitado, setDeitado] = useState(false);
  const medirCapa = useCallback((capa: HTMLImageElement | null) => {
    if (capa?.complete) setDeitado(ehVideoDeitado(capa.naturalWidth, capa.naturalHeight));
  }, []);
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={`Ver o vídeo: ${video.titulo} (${video.duracao})`}
      className="flex w-full items-center gap-3 rounded-xl border border-cinza-claro bg-branco p-2.5 text-left text-azul-noite transition-colors hover:border-ambar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
    >
      <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-azul-noite">
        {/* eslint-disable-next-line @next/next/no-img-element -- capa estática de public/videos, tamanho varia por vídeo */}
        <img
          src={video.capa}
          alt=""
          loading="lazy"
          // Capa já em cache carrega antes da hidratação: o ref mede na montagem.
          ref={medirCapa}
          onLoad={(e) => medirCapa(e.currentTarget)}
          className="h-full w-full object-contain"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
          <IconePlay className="h-7 w-7" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug">{video.titulo}</span>
        <span className="mt-0.5 block text-sm text-cinza-medio">{video.duracao}</span>
        {deitado && (
          <span className="mt-1.5 inline-block rounded-full bg-ambar/15 px-2 py-0.5 text-xs font-semibold text-azul-noite">
            Melhor com o celular deitado
          </span>
        )}
      </span>
    </button>
  );
}
