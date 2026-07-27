"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GuardaEdicaoContextType = {
  ativar: (mensagem?: string) => void;
  desativar: () => void;
};

const GuardaEdicaoContext = createContext<GuardaEdicaoContextType | null>(null);

const MENSAGEM_PADRAO = "Você tem alterações que ainda não foram salvas. Se sair agora, elas se perdem.";

/** Mesmo mecanismo do GuardaContagem (intercepta clique em link e fecho de
 * aba enquanto ativo), generalizado com mensagem configurável por tela -
 * usado em qualquer edição que só existe em memória até salvar (Edição de
 * Dados de Produtos/Fornecedores, Criar Cotação). Mantido separado do
 * GuardaContagem de propósito, pra não arriscar mexer nesse fluxo já
 * validado em produção. */
export function useGuardaEdicao() {
  const ctx = useContext(GuardaEdicaoContext);
  if (!ctx) throw new Error("useGuardaEdicao precisa estar dentro de GuardaEdicaoProvider");
  return ctx;
}

export function GuardaEdicaoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ativoRef = useRef(false);
  const mensagemRef = useRef(MENSAGEM_PADRAO);
  const [hrefPendente, setHrefPendente] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);

  const ativar = useCallback((msg?: string) => {
    ativoRef.current = true;
    mensagemRef.current = msg ?? MENSAGEM_PADRAO;
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
      setMensagem(mensagemRef.current);
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

  function continuarEditando() {
    setHrefPendente(null);
  }

  return (
    <GuardaEdicaoContext.Provider value={{ ativar, desativar }}>
      {children}
      {hrefPendente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-azul-noite/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-branco p-5 shadow-xl">
            <h2 className="font-display text-lg font-bold text-azul-noite">Sair sem salvar?</h2>
            <p className="mt-2 text-sm leading-relaxed text-cinza">{mensagem}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={continuarEditando}
                className="flex-1 rounded-md bg-ambar px-3 py-2.5 text-sm font-bold text-azul-noite hover:bg-[#b07720]"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={sair}
                className="flex-1 rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white"
              >
                Sair mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardaEdicaoContext.Provider>
  );
}
