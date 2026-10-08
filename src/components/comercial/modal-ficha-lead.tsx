"use client";

import { useCallback, useEffect, useState } from "react";
import { carregarFichaLeadAction, type FichaLeadDados } from "@/app/(app)/escritorio/comercial/actions";
import { FichaLead } from "@/components/comercial/ficha-lead";
import { ModalFlutuante } from "@/components/modal-flutuante";

/** Ficha do lead aberta por cima do funil (mesmo comportamento da janela de
 * tarefa do kanban do Horizzon HUB): o kanban fica atrás, na mesma rolagem, e
 * fechar volta para ele. O pai monta com `key={leadId}` para zerar o estado
 * a cada lead aberto. Depois de cada ação salva, a ficha recarrega e o
 * `router.refresh()` do `useAcao` atualiza o kanban sem recarregar a página. */
export function ModalFichaLead({ leadId, aoFechar }: { leadId: string; aoFechar: () => void }) {
  const [dados, setDados] = useState<FichaLeadDados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    const r = await carregarFichaLeadAction(leadId);
    if (r.ok) {
      setDados(r.dados);
      setErro(null);
      setVersao((v) => v + 1);
    } else {
      setErro(r.mensagem);
    }
  }, [leadId]);

  useEffect(() => {
    let ativo = true;
    carregarFichaLeadAction(leadId).then((r) => {
      if (!ativo) return;
      if (r.ok) setDados(r.dados);
      else setErro(r.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [leadId]);

  useEffect(() => {
    // Captura na janela: o Esc fecha a ficha e não chega ao kanban em tela
    // cheia atrás dela. Com um formulário da ficha aberto, o Esc não fecha nada.
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (document.querySelectorAll("[data-modal-flutuante]").length <= 1) aoFechar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);

  return (
    <ModalFlutuante aberto onFechar={aoFechar} larga>
      {dados ? (
        <FichaLead
          key={versao}
          lead={dados.lead}
          eventos={dados.eventos}
          organizacoes={dados.organizacoes}
          aoFechar={aoFechar}
          aoAlterar={() => void carregar()}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-cinza-medio">{erro ?? "Carregando a ficha do lead..."}</p>
          {erro && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={aoFechar}
                className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm font-semibold text-cinza-medio hover:bg-branco"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      )}
    </ModalFlutuante>
  );
}
