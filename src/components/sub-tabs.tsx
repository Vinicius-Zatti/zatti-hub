"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubTabs({ items }: { items: { label: string; href: string }[] }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-cinza-claro">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
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
