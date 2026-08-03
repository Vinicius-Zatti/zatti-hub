"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubTabs({ items }: { items: { label: string; href: string }[] }) {
  const pathname = usePathname();

  // Quando dois hrefs da lista são prefixo um do outro (ex: /estoque/contagem
  // e /estoque/contagem/visualizacao), só o match mais específico fica ativo.
  // Compara só o caminho (sem query string) - um item pode chegar com
  // `?data=...` anexado (ver PedidosSubTabs) só pra preservar contexto entre
  // abas, isso não pode interferir em qual aba está marcada como ativa.
  const hrefAtivo = items
    .filter((item) => {
      const base = item.href.split("?")[0];
      return pathname === base || pathname.startsWith(`${base}/`);
    })
    .sort((a, b) => b.href.split("?")[0].length - a.href.split("?")[0].length)[0]?.href;

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-cinza-claro">
      {items.map((item) => {
        const active = item.href === hrefAtivo;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-branco text-azul-noite border-x border-t border-cinza-claro -mb-px"
                : "text-cinza-medio hover:text-azul-noite"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
