import Link from "next/link";
import { NavTabs, type NavItem, type NavSection } from "@/components/nav-tabs";
import { GuardaContagemProvider } from "@/components/guarda-contagem";
import { GuardaEdicaoProvider } from "@/components/guarda-edicao";
import { OrgSwitcher } from "@/components/org-switcher";
import { getAcessoAtual } from "@/lib/acesso";
import { signOutAction } from "@/lib/supabase/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getAcessoAtual();
  const podeGerir = acesso.role !== "operacional";

  const secoesEstoque: NavSection[] = [
    {
      label: "Produtos",
      items: [
        { label: "Consultar produtos", href: "/estoque/produtos" },
        ...(podeGerir
          ? [{ label: "Editar dados", href: "/estoque/produtos/edicao" }]
          : []),
      ],
    },
    {
      label: "Contagem",
      items: [
        { label: "Fazer contagem", href: "/estoque/contagem" },
        { label: "Conferir contagens", href: "/estoque/contagem/visualizacao" },
      ],
    },
    {
      label: "Pedidos",
      items: [
        ...(podeGerir
          ? [
              { label: "Criar cotação", href: "/estoque/pedidos" },
              { label: "Editor de espelhos", href: "/estoque/pedidos/cotacoes" },
            ]
          : []),
        { label: "Pedidos feitos", href: "/estoque/pedidos/feitos" },
      ],
    },
    ...(podeGerir
      ? [
          {
            label: "Fornecedores",
            items: [
              { label: "Consultar fornecedores", href: "/estoque/fornecedores" },
              { label: "Editar dados", href: "/estoque/fornecedores/edicao" },
            ],
          },
          {
            label: "CMV Real",
            items: [{ label: "Consultar CMV", href: "/estoque/cmv" }],
          },
        ]
      : []),
  ];

  // Financeiro só sai de "em breve" pra unidade com a flag ligada
  // (`unidades.consolidado_vendas_habilitado`, configurável por cliente).
  const NAV_ITEMS: NavItem[] = [
    {
      label: "Estoque",
      href: "/estoque/produtos",
      activePrefix: "/estoque",
      disabled: false,
      sections: secoesEstoque,
    },
    {
      label: "Financeiro",
      href: "/financeiro/consolidado/novo",
      activePrefix: "/financeiro",
      disabled: !acesso.consolidadoVendasHabilitado,
    },
    { label: "Fichas Técnicas", href: "#", disabled: true },
    { label: "Tarefas", href: "#", disabled: true },
    { label: "Marketing", href: "#", disabled: true },
  ];

  return (
    <GuardaContagemProvider>
    <GuardaEdicaoProvider>
      <div className="flex min-h-full flex-col">
        <header className="bg-azul-noite text-branco">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/estoque/produtos" className="flex items-center">
              <img src="/brand/zatti-logo-invertida.svg" alt="Zatti Hub" className="h-7 w-auto" />
            </Link>
            <div className="flex items-center gap-3 text-sm">
              {acesso.organizacoesDisponiveis.length > 1 ? (
                <OrgSwitcher
                  organizacoes={acesso.organizacoesDisponiveis}
                  atual={acesso.organizacaoId}
                />
              ) : (
                <span className="hidden text-cinza-claro sm:inline">
                  {acesso.organizacaoNome}
                </span>
              )}
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ambar text-sm font-bold text-azul-noite">
                {acesso.organizacaoNome.charAt(0).toUpperCase() || "?"}
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-xs text-cinza-claro underline-offset-2 hover:text-branco hover:underline"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>
        </header>

        <div className="sticky top-0 z-30 bg-azul-noite text-branco shadow-md">
          <NavTabs items={NAV_ITEMS} />
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>

        <footer className="border-t border-cinza-claro bg-branco py-4 text-center text-xs text-cinza-medio">
          Powered by <span className="font-semibold text-azul-petroleo">Zatti Consultoria</span>
        </footer>
      </div>
    </GuardaEdicaoProvider>
    </GuardaContagemProvider>
  );
}
