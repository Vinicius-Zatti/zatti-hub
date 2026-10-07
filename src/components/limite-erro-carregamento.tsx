"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ErroCarregamento } from "@/components/erro-carregamento";
import { gerarCodigoErroNavegador, identificadorDoErro } from "@/lib/suporte";
import { registrarErroNavegadorAction } from "@/app/(app)/suporte-actions";

// Corpo único dos `error.tsx` do app (Financeiro, Estoque, Painel...): qualquer
// leitura que falhe - inclusive no meio da paginação - cai aqui. A tela não
// fica em branco nem mostra número parcial, e as abas do segmento continuam no
// lugar (o layout fica fora do limite).
export default function LimiteErroCarregamento({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const tela = usePathname() ?? "/";
  // Só o digest do Next ou uma mensagem pública: nunca a mensagem crua. Erro
  // que nasceu no navegador não tem nenhum dos dois - ganha um código NAV-
  // que vai para o log do servidor e para a mensagem de suporte.
  const identificadorServidor = identificadorDoErro(error);
  const [codigoNavegador] = useState(() => (identificadorServidor ? null : gerarCodigoErroNavegador()));
  const identificador = identificadorServidor ?? codigoNavegador;

  useEffect(() => {
    console.error(error);
    if (codigoNavegador) {
      registrarErroNavegadorAction({
        codigo: codigoNavegador,
        tela,
        nome: error.name,
        mensagem: error.message,
      }).catch(() => {});
    }
  }, [error, codigoNavegador, tela]);

  return (
    <ErroCarregamento identificador={identificador}>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border border-azul-petroleo px-3 py-1 text-xs font-bold text-azul-petroleo"
      >
        Tentar de novo
      </button>
    </ErroCarregamento>
  );
}
