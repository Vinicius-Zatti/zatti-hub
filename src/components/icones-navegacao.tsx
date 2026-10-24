export type NomeIconeNavegacao =
  | "painel"
  | "estoque"
  | "cadastros"
  | "relatorios"
  | "financeiro"
  | "financeiroGerencial"
  | "meuTempo"
  | "agenda"
  | "escritorio"
  | "fichas"
  | "tarefas"
  | "contagem"
  | "pedidos"
  | "marketing"
  | "organizacao"
  | "acessos"
  | "sair"
  | "recolher"
  | "expandir"
  | "menu"
  | "buscar"
  | "seta"
  | "fechar";

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
    // Cadastros (Navegação V2): ficha com linhas, o que se cadastra uma vez e se consulta.
    cadastros: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M13 8h4M13 11h4M8 15h8M8 18h5" />
      </>
    ),
    // Relatórios (Navegação V2): folha com gráfico de barras.
    relatorios: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5" />
        <path d="M9.5 18v-3M12.5 18v-6M15.5 18v-4" />
      </>
    ),
    financeiro: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    ),
    financeiroGerencial: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V8" />
      </>
    ),
    meuTempo: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    agenda: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
    escritorio: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M12 4v16M3 12h18" />
        <circle cx="7.5" cy="8" r="1" />
        <circle cx="16.5" cy="16" r="1" />
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
    // Barra inferior do celular (Navegação V2): prancheta da contagem e carrinho dos pedidos.
    contagem: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="M9 10h6M9 14h6M9 18h3" />
      </>
    ),
    pedidos: (
      <>
        <path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h8.4a1.5 1.5 0 0 0 1.5-1.2L20 8H6.2" />
        <circle cx="9.5" cy="19.5" r="1.2" />
        <circle cx="16.5" cy="19.5" r="1.2" />
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
    acessos: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
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
    // Menu em sanfona (Navegação V2): abrir a gaveta, filtrar, seta do grupo e fechar.
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    buscar: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-4.2-4.2" />
      </>
    ),
    seta: <path d="m6 9 6 6 6-6" />,
    fechar: <path d="M6 6l12 12M18 6 6 18" />,
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
