"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnidadeSuporte } from "@/components/contexto-suporte";
import { IconePlay } from "@/components/videos-ajuda";
import { montarLinkDuvidaWhatsApp } from "@/lib/suporte";

// Ajuda fixa no rodapé do Menu (26/10/2026), nos dois menus (Navegação V2 e o
// antigo): a central de Vídeos explicativos e o suporte pelo WhatsApp, no
// número único de `lib/suporte.ts`.

export const CAMINHO_VIDEOS_EXPLICATIVOS = "/ajuda/videos";

type PropsItem = {
  /** Fecha a gaveta do celular (Navegação V2) ao tocar. */
  aoAbrir?: () => void;
  /** Some com o menu recolhido no desktop (só o ícone fica). */
  classeRotulo: string;
  classeAlinhamento: string;
};

const CLASSE_ITEM =
  "mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:min-h-10";

export function ItemMenuVideosExplicativos({ aoAbrir, classeRotulo, classeAlinhamento }: PropsItem) {
  const ativo = usePathname() === CAMINHO_VIDEOS_EXPLICATIVOS;
  return (
    <Link
      href={CAMINHO_VIDEOS_EXPLICATIVOS}
      onClick={aoAbrir}
      aria-current={ativo ? "page" : undefined}
      title="Vídeos explicativos"
      className={`${CLASSE_ITEM} ${ativo ? "bg-white/10 text-branco" : "text-white/75"} ${classeAlinhamento}`}
    >
      <IconePlay />
      <span className={classeRotulo}>Vídeos explicativos</span>
    </Link>
  );
}

export function ItemMenuSuporteWhatsApp({ aoAbrir, classeRotulo, classeAlinhamento }: PropsItem) {
  const unidade = useUnidadeSuporte();
  return (
    <a
      href={montarLinkDuvidaWhatsApp(unidade)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={aoAbrir}
      title="Falar com o suporte (WhatsApp)"
      className={`${CLASSE_ITEM} text-white/75 ${classeAlinhamento}`}
    >
      <IconeConversa />
      <span className={`leading-tight ${classeRotulo}`}>Falar com o suporte (WhatsApp)</span>
    </a>
  );
}

function IconeConversa() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
    >
      <path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.6Z" />
      <path d="M9 9.5c0 2.6 2.3 5 5 5l1-1.3-1.8-.9-.8.8a3.7 3.7 0 0 1-1.9-1.9l.8-.8-.9-1.8L9 9.5Z" />
    </svg>
  );
}
