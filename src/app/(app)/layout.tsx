import Link from "next/link";
import { NavTabs } from "@/components/nav-tabs";
import { GuardaContagemProvider } from "@/components/guarda-contagem";
import { OrgSwitcher } from "@/components/org-switcher";
import { getAcessoAtual } from "@/lib/acesso";
import { signOutAction } from "@/lib/supabase/actions";

const NAV_ITEMS = [
  { label: "Estoque", href: "/estoque/produtos", disabled: false },
  { label: "Financeiro", href: "#", disabled: true },
  { label: "Fichas Técnicas", href: "#", disabled: true },
  { label: "Tarefas", href: "#", disabled: true },
  { label: "Marketing", href: "#", disabled: true },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getAcessoAtual();

  return (
    <GuardaContagemProvider>
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
          <NavTabs items={NAV_ITEMS} />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>

        <footer className="border-t border-cinza-claro bg-branco py-4 text-center text-xs text-cinza-medio">
          Powered by <span className="font-semibold text-azul-petroleo">Zatti Consultoria</span>
        </footer>
      </div>
    </GuardaContagemProvider>
  );
}
