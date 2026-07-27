"use client";

/** Botão de expandir/recolher tabela pra tela cheia - fica ao lado dos
 * outros controles do cabeçalho da tabela (busca, Salvar todos). */
export function BotaoExpandir({ expandido, onClick }: { expandido: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={expandido ? "Sair da tela cheia" : "Expandir tabela"}
      aria-label={expandido ? "Sair da tela cheia" : "Expandir tabela"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cinza-claro bg-branco text-cinza-medio hover:border-ambar hover:text-ambar"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {expandido ? (
          <>
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </>
        ) : (
          <>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </>
        )}
      </svg>
    </button>
  );
}
