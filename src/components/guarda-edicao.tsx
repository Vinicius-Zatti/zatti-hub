"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GuardaEdicaoContextType = {
  /** `aoSalvar` opcional - quando informado, o aviso ganha um 3º botão
   * "Salvar e sair" que chama essa função e só navega se ela devolver
   * `true`. Sem ele, o aviso continua só com Continuar editando/Sair mesmo
   * assim (comportamento de sempre). */
  ativar: (mensagem?: string, aoSalvar?: () => Promise<boolean>) => void;
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
  const aoSalvarRef = useRef<(() => Promise<boolean>) | null>(null);
  const [hrefPendente, setHrefPendente] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);
  const [temSalvar, setTemSalvar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const ativar = useCallback((msg?: string, aoSalvar?: () => Promise<boolean>) => {
    ativoRef.current = true;
    mensagemRef.current = msg ?? MENSAGEM_PADRAO;
    aoSalvarRef.current = aoSalvar ?? null;
  }, []);
  const desativar = useCallback(() => {
    ativoRef.current = false;
    aoSalvarRef.current = null;
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
      setTemSalvar(aoSalvarRef.current !== null);
      setErroSalvar(null);
      setHrefPendente(href);
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  // Aviso nativo do navegador pra F5/fechar aba/atualizar - nenhum site
  // consegue trocar esse texto nem os botões (bloqueado por todo navegador
  // desde 2016, contra site malicioso que prende o usuário numa tela falsa).
  // O máximo possível é isto: pedir pro navegador mostrar o aviso genérico
  // dele mesmo.
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

  async function salvarESair() {
    const aoSalvar = aoSalvarRef.current;
    if (!aoSalvar) return;
    setSalvando(true);
    setErroSalvar(null);
    let ok = false;
    try {
      ok = await aoSalvar();
    } catch {
      ok = false;
    }
    setSalvando(false);
    if (!ok) {
      setErroSalvar("Não foi possível salvar. Tenta de novo ou sai sem salvar.");
      return;
    }
    sair();
  }

  return (
    <GuardaEdicaoContext.Provider value={{ ativar, desativar }}>
      {children}
      {hrefPendente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-azul-noite/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-branco p-5 shadow-xl">
            <h2 className="font-display text-lg font-bold text-azul-noite">Sair sem salvar?</h2>
            <p className="mt-2 text-sm leading-relaxed text-cinza">{mensagem}</p>
            {erroSalvar && <p className="mt-2 text-sm text-vermelho">{erroSalvar}</p>}
            {temSalvar ? (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={continuarEditando}
                  disabled={salvando}
                  className="w-full rounded-md bg-ambar px-3 py-2.5 text-sm font-bold text-azul-noite hover:bg-[#b07720] disabled:opacity-50"
                >
                  Continuar editando
                </button>
                <button
                  type="button"
                  onClick={salvarESair}
                  disabled={salvando}
                  className="w-full rounded-md bg-azul-noite px-3 py-2.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "Salvar e sair"}
                </button>
                <button
                  type="button"
                  onClick={sair}
                  disabled={salvando}
                  className="w-full rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white disabled:opacity-50"
                >
                  Sair mesmo assim
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </GuardaEdicaoContext.Provider>
  );
}
