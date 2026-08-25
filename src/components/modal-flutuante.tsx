"use client";

/** Casca de modal padrão do app (Produtos/Fornecedores/Fichas Técnicas):
 * folha que sobe do rodapé no celular, caixa centralizada no desktop. Item 1
 * da correção de 25/08 do Financeiro gerencial - extraído porque o mesmo
 * bloco (`fixed inset-0 ...`) já se repetia em `novo-produto-modal.tsx` e
 * `lista-fichas-tecnicas.tsx` antes desta 4ª+ cópia (Plano de Contas, Contas
 * Financeiras, Receitas, Despesas). */
export function ModalFlutuante({
  aberto,
  onFechar,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-azul-noite/60 sm:items-center sm:p-4" onClick={onFechar}>
      <div
        className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-off-white p-4 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
