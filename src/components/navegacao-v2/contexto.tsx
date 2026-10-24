"use client";

import { createContext, useContext } from "react";

// Navegação V2 (24/10/2026): diz às telas que estão dentro da estrutura do
// piloto. Lá o cabeçalho de módulo com as abas novas (`cabecalho-modulo.tsx`)
// substitui as `SubTabs` e o caminho do Estoque; fora do piloto o valor é
// `false` e nada muda.
const NavegacaoV2Contexto = createContext(false);

export function NavegacaoV2Provider({ children }: { children: React.ReactNode }) {
  return <NavegacaoV2Contexto value={true}>{children}</NavegacaoV2Contexto>;
}

export function useNavegacaoV2(): boolean {
  return useContext(NavegacaoV2Contexto);
}
