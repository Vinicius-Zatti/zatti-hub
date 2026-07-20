"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  disabled: boolean;
};

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
        {items.map((item) => {
          const active = !item.disabled && pathname.startsWith(item.href);
          if (item.disabled) {
            return (
              <span
                key={item.label}
                title="Em breve"
                className="flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-white/30"
              >
                {item.label}
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold">
                  em breve
                </span>
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-ambar text-ambar"
                  : "border-transparent text-white/70 hover:border-white/30 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
