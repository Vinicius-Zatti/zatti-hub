"use client";

/** Casca de modal padrão do app (Produtos/Fornecedores/Fichas Técnicas):
 * folha que sobe do rodapé no celular, caixa centralizada no desktop. Item 1
 * da correção de 25/08 do Financeiro gerencial - extraído porque o mesmo
 * bloco (`fixed inset-0 ...`) já se repetia em `novo-produto-modal.tsx` e
 * `lista-fichas-tecnicas.tsx` antes desta 4ª+ cópia (Plano de Contas, Contas
 * Financeiras, Receitas, Despesas).
 *
 * Só fecha pelos botões da própria janela (09/11): clicar fora não fecha,
 * para um clique perdido não jogar fora o que está sendo revisado ou digitado. */
export function ModalFlutuante({
  aberto,
  onFechar,
  children,
  larga = false,
  cheiaDeitado = false,
  semBotaoFechar = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
  /** Caixa larga no desktop, para ficha de detalhe aberta por cima de uma
   * lista/kanban (ex.: ficha do lead no Comercial). Formulário fica estreito. */
  larga?: boolean;
  /** Celular deitado (pouca altura): a caixa usa quase a tela toda, com
   * margens menores. Para o player de vídeo horizontal (`videos-ajuda.tsx`). */
  cheiaDeitado?: boolean;
  /** Para janela que já traz o próprio botão de fechar no topo. */
  semBotaoFechar?: boolean;
}) {
  if (!aberto) return null;
  return (
    <div
      data-modal-flutuante
      className={`fixed inset-0 z-50 flex items-end justify-center bg-azul-noite/60 sm:items-center sm:p-4 ${cheiaDeitado ? "deitado:p-2" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-off-white p-4 sm:rounded-2xl ${larga ? "sm:max-w-4xl" : "sm:max-w-lg"} ${cheiaDeitado ? "deitado:max-h-[calc(100dvh-1rem)] deitado:max-w-none deitado:p-3" : ""}`}
      >
        {!semBotaoFechar && (
          <div className="pointer-events-none sticky top-0 z-20 -mr-2 -mt-2 flex justify-end">
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              title="Fechar"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-off-white text-base text-cinza-medio transition-colors hover:bg-branco hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
