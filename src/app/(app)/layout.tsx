import Link from "next/link";
import { NavTabs } from "@/components/nav-tabs";

const NAV_ITEMS = [
  { label: "Estoque", href: "/estoque/produtos", disabled: false },
  { label: "Financeiro", href: "#", disabled: true },
  { label: "Fichas Técnicas", href: "#", disabled: true },
  { label: "Tarefas", href: "#", disabled: true },
  { label: "Marketing", href: "#", disabled: true },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: trocar por tenant real assim que a autenticação (Supabase) estiver ligada
  const tenantName = "Dom Quixote Hamburgueria";

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-azul-noite text-branco">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/estoque/produtos" className="flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tracking-wide">
              ZATTI
            </span>
            <span className="text-xs font-semibold tracking-widest text-ambar">
              HUB
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-cinza-claro sm:inline">
              {tenantName}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ambar text-sm font-bold text-azul-noite">
              V
            </div>
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
  );
}
