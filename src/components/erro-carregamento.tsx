"use client";

import { usePathname } from "next/navigation";
import { useUnidadeSuporte } from "@/components/contexto-suporte";
import { MENSAGEM_ERRO_CARREGAMENTO } from "@/lib/erros";
import { montarLinkSuporteWhatsApp } from "@/lib/suporte";

/** Aviso de leitura que falhou - mesmo cartão de `ConectarPlanilha`, com o
 * texto aprovado de erro do app. Nunca mostra dado parcial no lugar. O botão
 * de WhatsApp leva a mensagem pronta (unidade, tela, data/hora e
 * identificador do erro) - o usuário só clica e envia. */
export function ErroCarregamento({
  identificador = null,
  children,
}: {
  /** `error.digest` do Next ou a mensagem pública do erro - nunca stack/SQL. */
  identificador?: string | null;
  children?: React.ReactNode;
}) {
  const unidade = useUnidadeSuporte();
  const tela = usePathname() ?? "/";

  function chamarSuporte() {
    // Data e hora do clique, montadas só no navegador.
    const link = montarLinkSuporteWhatsApp({ unidade, tela, momento: new Date(), identificador });
    window.open(link, "_blank", "noopener,noreferrer");
  }

  return (
    <div role="alert" className="mx-auto max-w-xl rounded-lg border border-ambar bg-ambar/10 p-6">
      <h2 className="font-display text-xl font-bold text-azul-noite">Erro ao carregar a tela</h2>
      <p className="mt-2 text-sm text-cinza">{MENSAGEM_ERRO_CARREGAMENTO}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={chamarSuporte}
          className="rounded-md bg-azul-petroleo px-3 py-1 text-xs font-bold text-branco"
        >
          Chamar o suporte no WhatsApp
        </button>
        {children}
      </div>
    </div>
  );
}
