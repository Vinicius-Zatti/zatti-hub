"use client";

import { createContext, useContext } from "react";

// Nome da unidade logada para a mensagem de suporte do cartão de erro. Vem da
// sessão (layout do app), nunca de input do usuário.
const UnidadeSuporteContext = createContext<string | null>(null);

export function UnidadeSuporteProvider({ unidade, children }: { unidade: string; children: React.ReactNode }) {
  return <UnidadeSuporteContext.Provider value={unidade}>{children}</UnidadeSuporteContext.Provider>;
}

/** `null` fora do app logado (ex. tela de planilha pendente). */
export function useUnidadeSuporte(): string | null {
  return useContext(UnidadeSuporteContext);
}
