"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconeNavegacao, type NomeIconeNavegacao } from "@/components/icones-navegacao";
import { OrgSwitcher } from "@/components/org-switcher";
import { signOutAction } from "@/lib/supabase/actions";

export type SecaoNavegacao = {
  label: string;
  items: { label: string; href: string }[];
};

export type ItemNavegacao = {
  label: string;
  href: string;
  icone: NomeIconeNavegacao;
  disabled: boolean;
  activePrefix?: string;
  sections?: SecaoNavegacao[];
};

type Props = {
  children: React.ReactNode;
  items: ItemNavegacao[];
  organizacaoAtual: string;
  organizacaoNome: string;
  organizacoes: { id: string; nome: string }[];
};

const PAINEL_ORGANIZACAO = "__organizacao";

export function EstruturaAplicativo({
  children,
  items,
  organizacaoAtual,
  organizacaoNome,
  organizacoes,
}: Props) {
  const pathname = usePathname();
  const [recolhido, setRecolhido] = useState(false);
  const [painelAberto, setPainelAberto] = useState<{
    label: string;
    caminho: string;
  } | null>(null);
  const lateralRef = useRef<HTMLElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const labelAberto = painelAberto?.caminho === pathname ? painelAberto.label : null;
  const itemAberto = items.find((item) => item.label === labelAberto && item.sections);
  const variasOrganizacoes = organizacoes.length > 1;

  useEffect(() => {
    if (!labelAberto) return;

    function aoClicarFora(evento: MouseEvent) {
      if (!lateralRef.current?.contains(evento.target as Node)) setPainelAberto(null);
    }

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setPainelAberto(null);
      gatilhoRef.current?.focus();
    }

    document.addEventListener("click", aoClicarFora);
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.removeEventListener("click", aoClicarFora);
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [labelAberto]);

  function alternarPainel(label: string, gatilho: HTMLButtonElement) {
    gatilhoRef.current = gatilho;
    setPainelAberto(
      labelAberto === label ? null : { label, caminho: pathname },
    );
  }

  const larguraLateral = recolhido ? "lg:w-[5.5rem]" : "lg:w-64";
  const recuoConteudo = recolhido ? "lg:pl-[5.5rem]" : "lg:pl-64";
  const alinhamentoItem = recolhido ? "lg:justify-center" : "lg:justify-start";

  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo-principal"
        className="fixed left-2 top-2 z-50 -translate-y-20 rounded-md bg-ambar px-3 py-2 text-sm font-bold text-azul-noite transition-transform focus:translate-y-0 focus:outline-none"
      >
        Pular para o conteúdo
      </a>
      <aside
        ref={lateralRef}
        className={`fixed inset-y-0 left-0 z-40 flex w-[5.5rem] flex-col border-r border-white/10 bg-azul-noite text-branco shadow-xl transition-[width] duration-200 ${larguraLateral}`}
      >
        <Link
          href="/estoque/produtos"
          aria-label="Ir para o início do Zatti Hub"
          title="Zatti Hub"
          className="flex h-16 shrink-0 items-center justify-center border-b border-white/10 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ambar"
        >
          <Image
            src="/brand/zatti-logo-invertida.svg"
            alt="Zatti Hub"
            width={160}
            height={69}
            priority
            className={`h-auto transition-[width] duration-200 ${
              recolhido ? "w-[4.5rem]" : "w-[4.5rem] lg:w-36"
            }`}
          />
        </Link>

        <button
          type="button"
          onClick={() => {
            setPainelAberto(null);
            setRecolhido((atual) => !atual);
          }}
          aria-label={recolhido ? "Expandir menu lateral" : "Recolher menu lateral"}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-[4.5rem] hidden h-7 w-7 items-center justify-center rounded-full border border-cinza-claro bg-branco text-azul-noite shadow-md transition-colors hover:bg-off-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:flex"
        >
          <IconeNavegacao nome={recolhido ? "expandir" : "recolher"} className="h-4 w-4" />
        </button>

        <nav aria-label="Módulos do sistema" className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
          <div className="flex flex-col gap-1.5">
            {items.map((item) => {
              const ativo = !item.disabled && pathname.startsWith(item.activePrefix ?? item.href);
              const painelDoItemAberto = labelAberto === item.label;
              const classeBase = `flex min-h-11 w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${alinhamentoItem}`;

              if (item.disabled) {
                return (
                  <div
                    key={item.label}
                    aria-disabled="true"
                    title={`${item.label} - em breve`}
                    className={`${classeBase} cursor-not-allowed text-white/30`}
                  >
                    <IconeNavegacao nome={item.icone} className="h-5 w-5 shrink-0" />
                    {!recolhido && (
                      <span className="hidden min-w-0 flex-1 items-center justify-between gap-2 lg:flex">
                        <span className="truncate">{item.label}</span>
                        <span className="text-[10px] font-semibold">em breve</span>
                      </span>
                    )}
                  </div>
                );
              }

              if (item.sections) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-label={item.label}
                    aria-expanded={painelDoItemAberto}
                    aria-controls="painel-destinos"
                    title={item.label}
                    onClick={(evento) => alternarPainel(item.label, evento.currentTarget)}
                    className={`${classeBase} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
                      ativo || painelDoItemAberto
                        ? "bg-ambar font-bold text-azul-noite"
                        : "text-white/75 hover:bg-white/10 hover:text-branco"
                    }`}
                  >
                    <IconeNavegacao nome={item.icone} className="h-5 w-5 shrink-0" />
                    {!recolhido && (
                      <>
                        <span className="hidden min-w-0 flex-1 truncate text-left lg:block">
                          {item.label}
                        </span>
                        <IconeNavegacao nome="expandir" className="hidden h-4 w-4 shrink-0 lg:block" />
                      </>
                    )}
                  </button>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={ativo ? "page" : undefined}
                  title={item.label}
                  className={`${classeBase} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
                    ativo
                      ? "bg-ambar font-bold text-azul-noite"
                      : "text-white/75 hover:bg-white/10 hover:text-branco"
                  }`}
                >
                  <IconeNavegacao nome={item.icone} className="h-5 w-5 shrink-0" />
                  {!recolhido && (
                    <span className="hidden min-w-0 flex-1 truncate text-left lg:block">
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 p-2">
          {!recolhido && (
            <div className="mb-2 hidden rounded-lg bg-white/5 p-2 lg:block">
              <p className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide text-white/45">
                Organização
              </p>
              {variasOrganizacoes ? (
                <OrgSwitcher organizacoes={organizacoes} atual={organizacaoAtual} />
              ) : (
                <p className="truncate text-xs font-medium text-branco" title={organizacaoNome}>
                  {organizacaoNome}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            aria-label={`Organização: ${organizacaoNome}`}
            title={organizacaoNome}
            onClick={(evento) => alternarPainel(PAINEL_ORGANIZACAO, evento.currentTarget)}
            className={`mb-1 flex min-h-11 w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-white/75 transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
              recolhido ? "lg:flex" : "lg:hidden"
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ambar text-xs font-bold text-azul-noite">
              {organizacaoNome.charAt(0).toUpperCase() || "?"}
            </span>
          </button>

          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className={`flex min-h-11 w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${alinhamentoItem}`}
            >
              <IconeNavegacao nome="sair" className="h-5 w-5 shrink-0" />
              {!recolhido && <span className="hidden lg:block">Sair</span>}
            </button>
          </form>
        </div>

        {itemAberto?.sections && (
          <PainelDestinos
            titulo={itemAberto.label}
            sections={itemAberto.sections}
            pathname={pathname}
            aoFechar={() => setPainelAberto(null)}
          />
        )}

        {labelAberto === PAINEL_ORGANIZACAO && (
          <div
            id="painel-destinos"
            className="absolute inset-y-0 left-full flex w-[calc(100vw-5.5rem)] max-w-sm flex-col border-r border-cinza-claro bg-branco text-cinza shadow-2xl"
          >
            <CabecalhoPainel titulo="Organização" aoFechar={() => setPainelAberto(null)} />
            <div className="p-4">
              <p className="mb-3 text-sm text-cinza-medio">Escolha qual cliente deseja acessar.</p>
              {variasOrganizacoes ? (
                <OrgSwitcher organizacoes={organizacoes} atual={organizacaoAtual} />
              ) : (
                <p className="text-sm font-semibold text-azul-noite">{organizacaoNome}</p>
              )}
            </div>
          </div>
        )}
      </aside>

      <div className={`flex min-h-dvh flex-col pl-[5.5rem] transition-[padding-left] duration-200 ${recuoConteudo}`}>
        <main
          id="conteudo-principal"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-6 lg:py-6"
        >
          {children}
        </main>
        <footer className="border-t border-cinza-claro bg-branco px-3 py-4 text-center text-xs text-cinza-medio">
          Powered by <span className="font-semibold text-azul-petroleo">Zatti Consultoria</span>
        </footer>
      </div>
    </div>
  );
}

function CabecalhoPainel({ titulo, aoFechar }: { titulo: string; aoFechar: () => void }) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between border-b border-cinza-claro px-4">
      <h2 className="font-display text-xl font-bold text-azul-noite">{titulo}</h2>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar painel"
        title="Fechar painel"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-cinza-medio transition-colors hover:bg-off-white hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
      >
        <IconeNavegacao nome="recolher" className="h-5 w-5" />
      </button>
    </div>
  );
}

function PainelDestinos({
  titulo,
  sections,
  pathname,
  aoFechar,
}: {
  titulo: string;
  sections: SecaoNavegacao[];
  pathname: string;
  aoFechar: () => void;
}) {
  return (
    <div
      id="painel-destinos"
      className="absolute inset-y-0 left-full flex w-[calc(100vw-5.5rem)] max-w-sm flex-col border-r border-cinza-claro bg-branco text-cinza shadow-2xl"
    >
      <CabecalhoPainel titulo={titulo} aoFechar={aoFechar} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sections.map((section) => (
          <section key={section.label} aria-label={section.label} className="mb-2 rounded-lg bg-off-white p-3 last:mb-0">
            <h3 className="text-xs font-bold uppercase tracking-wide text-azul-petroleo">
              {section.label}
            </h3>
            <div className="mt-1.5 flex flex-col gap-1">
              {section.items.map((subitem) => {
                const ativo = pathname === subitem.href;
                return (
                  <Link
                    key={subitem.href}
                    href={subitem.href}
                    aria-current={ativo ? "page" : undefined}
                    onClick={aoFechar}
                    className={`flex min-h-11 items-center rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
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
  );
}
