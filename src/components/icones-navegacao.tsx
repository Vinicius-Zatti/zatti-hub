export type NomeIconeNavegacao =
  | "painel"
  | "estoque"
  | "financeiro"
  | "fichas"
  | "tarefas"
  | "marketing"
  | "organizacao"
  | "sair"
  | "recolher"
  | "expandir";

export function IconeNavegacao({
  nome,
  className = "h-5 w-5",
}: {
  nome: NomeIconeNavegacao;
  className?: string;
}) {
  const conteudo = {
    painel: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    estoque: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
        <path d="M12 11v10" />
      </>
    ),
    financeiro: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    ),
    fichas: (
      <>
        <path d="M6 3h9l3 3v15H6V3Z" />
        <path d="M15 3v4h4" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),
    tarefas: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    marketing: (
      <>
        <path d="m4 13 12-5v8L4 11v2Z" />
        <path d="M16 10c2 0 4-1 4-3M16 14c2 0 4 1 4 3" />
        <path d="m6 13 1 6h4l-2-5" />
      </>
    ),
    organizacao: (
      <>
        <path d="M4 21V7l8-4 8 4v14" />
        <path d="M9 21v-4h6v4M8 9h1M12 9h1M16 9h1M8 13h1M12 13h1M16 13h1" />
      </>
    ),
    sair: (
      <>
        <path d="M10 5H5v14h5" />
        <path d="M14 8l4 4-4 4M18 12H9" />
      </>
    ),
    recolher: (
      <>
        <path d="m13 6-6 6 6 6" />
        <path d="m19 6-6 6 6 6" />
      </>
    ),
    expandir: (
      <>
        <path d="m11 6 6 6-6 6" />
        <path d="m5 6 6 6-6 6" />
      </>
    ),
  }[nome];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {conteudo}
    </svg>
  );
}
