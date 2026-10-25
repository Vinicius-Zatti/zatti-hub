"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  CHAVE_TEMA_ATUAL,
  OPCOES_TEMA,
  PREFERENCIA_PADRAO,
  chavePreferenciaUsuario,
  lerPreferencia,
  resolverTema,
  type PreferenciaTema,
} from "@/lib/tema";

// Alternador Claro / Escuro / Automático do bloco de usuário do menu V2
// (desktop e gaveta do celular). Tema escuro: fase 7 da Navegação V2, só no
// piloto. Regras de guarda e do script do <head> em `lib/tema.ts`.

const EVENTO_TEMA = "zatti-hub:tema-mudou";
const CONSULTA_SISTEMA_ESCURO = "(prefers-color-scheme: dark)";

function lerSalvo(chave: string): PreferenciaTema {
  try {
    return lerPreferencia(window.localStorage.getItem(chave)) ?? PREFERENCIA_PADRAO;
  } catch {
    return PREFERENCIA_PADRAO;
  }
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO_TEMA, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO_TEMA, aviso);
    window.removeEventListener("storage", aviso);
  };
}

function aplicarNaPagina(preferencia: PreferenciaTema) {
  const sistemaEscuro = window.matchMedia?.(CONSULTA_SISTEMA_ESCURO).matches ?? false;
  document.documentElement.setAttribute("data-tema", resolverTema(preferencia, sistemaEscuro));
  try {
    window.localStorage.setItem(CHAVE_TEMA_ATUAL, preferencia);
  } catch {
    // Sem localStorage o tema vale só até recarregar.
  }
}

function IconeTema({ valor }: { valor: PreferenciaTema }) {
  const comum = {
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    className: "h-4 w-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (valor === "claro") {
    return (
      <svg {...comum}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (valor === "escuro") {
    return (
      <svg {...comum}>
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
    );
  }
  return (
    <svg {...comum}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function AlternadorTema({ usuario, className = "" }: { usuario: string; className?: string }) {
  const chave = chavePreferenciaUsuario(usuario);
  const preferencia = useSyncExternalStore(
    assinar,
    () => lerSalvo(chave),
    () => PREFERENCIA_PADRAO,
  );

  // Ao montar e a cada troca: aplica a escolha de quem está logado (o <head>
  // aplicou a do último usuário do aparelho). No automático, acompanha o aparelho.
  useEffect(() => {
    aplicarNaPagina(preferencia);
    if (preferencia !== "automatico" || !window.matchMedia) return;
    const consulta = window.matchMedia(CONSULTA_SISTEMA_ESCURO);
    const aoMudarSistema = () => aplicarNaPagina("automatico");
    consulta.addEventListener("change", aoMudarSistema);
    return () => consulta.removeEventListener("change", aoMudarSistema);
  }, [preferencia]);

  function escolher(valor: PreferenciaTema) {
    try {
      window.localStorage.setItem(chave, valor);
    } catch {
      // Sem localStorage: aplica só nesta visita.
      aplicarNaPagina(valor);
    }
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }

  return (
    <div role="group" aria-label="Tema da tela" className={`mb-1 flex gap-1 rounded-lg bg-white/5 p-1 ${className}`}>
      {OPCOES_TEMA.map((opcao) => {
        const ativo = opcao.valor === preferencia;
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ativo}
            title={opcao.dica}
            onClick={() => escolher(opcao.valor)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:min-h-8 ${
              ativo ? "bg-ambar text-azul-noite" : "text-white/75 hover:bg-white/10 hover:text-branco"
            }`}
          >
            <IconeTema valor={opcao.valor} />
            <span>{opcao.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}
