"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavSection = {
  label: string;
  items: { label: string; href: string }[];
};

export type NavItem = {
  label: string;
  href: string;
  disabled: boolean;
  activePrefix?: string;
  sections?: NavSection[];
};

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState<{ label: string; caminho: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const labelAberto = menuAberto?.caminho === pathname ? menuAberto.label : null;
  const itemAberto = items.find((item) => item.label === labelAberto && item.sections);

  useEffect(() => {
    if (!labelAberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (!navRef.current?.contains(evento.target as Node)) setMenuAberto(null);
    }

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setMenuAberto(null);
      gatilhoRef.current?.focus();
    }

    document.addEventListener("click", aoClicarFora);
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.removeEventListener("click", aoClicarFora);
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [labelAberto]);

  return (
    <nav ref={navRef} aria-label="Módulos do sistema" className="relative border-t border-white/10">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-4">
        {items.map((item) => {
          const active =
            !item.disabled && pathname.startsWith(item.activePrefix ?? item.href);
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

          if (item.sections) {
            const aberto = labelAberto === item.label;
            return (
              <button
                key={item.label}
                ref={gatilhoRef}
                type="button"
                aria-expanded={aberto}
                aria-controls="menu-estoque"
                onClick={() =>
                  setMenuAberto(aberto ? null : { label: item.label, caminho: pathname })
                }
                className={`flex shrink-0 items-center gap-1 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
                  active || aberto
                    ? "border-ambar text-ambar"
                    : "border-transparent text-white/70 hover:border-white/30 hover:text-white"
                }`}
              >
                {item.label}
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`}
                >
                  <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
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

      {itemAberto?.sections && (
        <div
          id="menu-estoque"
          className="absolute inset-x-0 top-full z-40 max-h-[calc(100vh-3rem)] overflow-y-auto border-t border-cinza-claro bg-branco text-cinza shadow-xl"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-2 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
            {itemAberto.sections.map((section) => (
              <section key={section.label} aria-label={section.label} className="rounded-lg bg-off-white p-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-azul-petroleo">
                  {section.label}
                </h2>
                <div className="mt-1.5 flex flex-col gap-1">
                  {section.items.map((subitem) => {
                    const ativo = pathname === subitem.href;
                    return (
                      <Link
                        key={subitem.href}
                        href={subitem.href}
                        aria-current={ativo ? "page" : undefined}
                        onClick={() => setMenuAberto(null)}
                        className={`rounded-md px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
                          ativo
                            ? "bg-azul-noite font-semibold text-branco"
                            : "text-cinza hover:bg-branco hover:text-azul-noite"
                        }`}
                      >
                        {subitem.label}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
