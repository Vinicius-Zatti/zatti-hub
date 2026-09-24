"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Abas do módulo Escritório (Time de IA | Clientes | Agenda | Meu Tempo). Fica
 * acima das `SubTabs` de cada seção. Não usa `SubTabs` porque a aba precisa
 * ficar ativa em qualquer subpágina da seção (/agenda/semana marca "Agenda").
 * "/escritorio" é prefixo de "/escritorio/clientes": vale o prefixo mais longo. */
const ABAS = [
  { label: "Time de IA", href: "/escritorio", prefixo: "/escritorio" },
  { label: "Clientes", href: "/escritorio/clientes", prefixo: "/escritorio/clientes" },
  { label: "Agenda", href: "/agenda/dia", prefixo: "/agenda" },
  { label: "Meu Tempo", href: "/meu-tempo/hoje", prefixo: "/meu-tempo" },
];

export function abaAtiva(pathname: string): string | undefined {
  return ABAS.filter((a) => pathname === a.prefixo || pathname.startsWith(`${a.prefixo}/`))
    .sort((a, b) => b.prefixo.length - a.prefixo.length)[0]?.href;
}

export function AbasEscritorio() {
  const pathname = usePathname();
  const ativa = abaAtiva(pathname);

  return (
    <nav aria-label="Seções do Escritório" className="flex gap-1 overflow-x-auto rounded-lg bg-azul-noite p-1">
      {ABAS.map((aba) => {
        const eAtiva = aba.href === ativa;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={eAtiva ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              eAtiva ? "bg-ambar text-azul-noite" : "text-branco/75 hover:text-branco"
            }`}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
