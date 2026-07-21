"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GuardaContagemContextType = {
  ativar: () => void;
  desativar: () => void;
};

const GuardaContagemContext = createContext<GuardaContagemContextType | null>(null);

/** Ativa/desativa o aviso de "sair perde a contagem" - a tela de Contagem
 * chama isso quando entra/sai da etapa de inventário em andamento. */
export function useGuardaContagem() {
  const ctx = useContext(GuardaContagemContext);
  if (!ctx) throw new Error("useGuardaContagem precisa estar dentro de GuardaContagemProvider");
  return ctx;
}

/** Dispara depois que a pessoa escolhe "Continuar contagem" no aviso - a
 * tela de Contagem escuta isso pra focar no primeiro item que falta. */
export const EVENTO_CONTINUAR_CONTAGEM = "guarda-contagem:continuar";

/** Intercepta QUALQUER navegação (clique em link, fechar aba) enquanto uma
 * contagem está em andamento, porque o progresso só existe em memória até
 * clicar em "Enviar Inventário" - sair sem avisar perde tudo. Montado uma
 * vez no layout do app, então cobre o menu principal e todos os menus
 * internos, não só a própria tela de Contagem. */
export function GuardaContagemProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ativoRef = useRef(false);
  const [hrefPendente, setHrefPendente] = useState<string | null>(null);

  const ativar = useCallback(() => {
    ativoRef.current = true;
  }, []);
  const desativar = useCallback(() => {
    ativoRef.current = false;
  }, []);

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (!ativoRef.current) return;
      const alvo = (e.target as HTMLElement)?.closest?.("a");
      if (!alvo) return;
      const href = alvo.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http")) return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setHrefPendente(href);
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  useEffect(() => {
    function aoFechar(e: BeforeUnloadEvent) {
      if (!ativoRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", aoFechar);
    return () => window.removeEventListener("beforeunload", aoFechar);
  }, []);

  function sair() {
    ativoRef.current = false;
    const href = hrefPendente;
    setHrefPendente(null);
    if (href) router.push(href);
  }

  function continuarContagem() {
    setHrefPendente(null);
    window.dispatchEvent(new Event(EVENTO_CONTINUAR_CONTAGEM));
  }

  return (
    <GuardaContagemContext.Provider value={{ ativar, desativar }}>
      {children}
      {hrefPendente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-azul-noite/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-branco p-5 shadow-xl">
            <h2 className="font-display text-lg font-bold text-azul-noite">Sair da contagem?</h2>
            <p className="mt-2 text-sm leading-relaxed text-cinza">
              Tem certeza que quer encerrar essa contagem antes de terminar? Se você sair agora, vai
              perder tudo o que já contou.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={continuarContagem}
                className="flex-1 rounded-md bg-ambar px-3 py-2.5 text-sm font-bold text-azul-noite hover:bg-[#b07720]"
              >
                Continuar contagem
              </button>
              <button
                type="button"
                onClick={sair}
                className="flex-1 rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardaContagemContext.Provider>
  );
}
