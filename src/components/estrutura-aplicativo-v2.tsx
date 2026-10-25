"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconeNavegacao } from "@/components/icones-navegacao";
import { OrgSwitcher } from "@/components/org-switcher";
import { BuscaGlobal, BuscaGlobalProvider } from "@/components/navegacao-v2/busca-global";
import { CabecalhoModuloV2 } from "@/components/navegacao-v2/cabecalho-modulo";
import { NavegacaoV2Provider } from "@/components/navegacao-v2/contexto";
import { AlternadorTema } from "@/components/navegacao-v2/alternador-tema";
import { cabecalhoDoModulo } from "@/lib/navegacao/abas";
import { teclaAbreBusca, type EntradaBusca } from "@/lib/navegacao/busca";
import { filtrarMenus, normalizarBusca } from "@/lib/navegacao/filtro";
import { posicaoGavetaAcimaDoTeclado, type PosicaoGaveta } from "@/lib/navegacao/gaveta-teclado";
import { moduloAtivo, subitemAtivo, type ItemNavegacao, type SecaoNavegacao } from "@/lib/navegacao/tipos";
import { limparTodosRascunhos } from "@/lib/rascunho-local";
import { signOutAction } from "@/lib/supabase/actions";

// Navegação V2, fase 1 (24/10/2026) - só a unidade piloto (`lib/navegacao/piloto.ts`).
// Menu em sanfona: o módulo abre os subitens logo abaixo dele, dentro do próprio
// menu (sem o painel flutuante à direita de `estrutura-aplicativo.tsx`), com o
// grupo da tela atual já aberto e o campo "Filtrar menus" no topo.
// Celular (24/10): barra inferior fixa com 4 atalhos por papel
// (`lib/navegacao/atalhos.ts`) + "Menu", que sobe o menu completo numa folha de
// baixo para cima. Telas com botões fixos no rodapé marcam `data-modo-foco` e a
// barra some enquanto elas estão abertas (Contagem e preenchimento do Garante).
// Desktop (lg): menu fixo à esquerda, recolhível até ficar só com os ícones.
// Módulos (24/10): cada módulo abre com cabeçalho e abas próprias
// (`navegacao-v2/cabecalho-modulo.tsx`), tirados do mesmo menu; as `SubTabs`
// antigas somem dentro desta estrutura (`navegacao-v2/contexto.tsx`).

type Props = {
  children: React.ReactNode;
  items: ItemNavegacao[];
  /** Atalhos da barra inferior do celular, já filtrados por papel e flags. */
  atalhos: ItemNavegacao[];
  /** Busca global (Ctrl+K / lupa): telas do menu e atalhos de ação, já filtrados por papel e flags. */
  entradasBusca: EntradaBusca[];
  /** Subtítulo do cabeçalho na página de entrada de cada módulo. */
  unidadeNome: string;
  organizacaoAtual: string;
  organizacaoNome: string;
  organizacoes: { id: string; nome: string }[];
  usuarioEmail: string;
  usuarioNome: string | null;
};

export function EstruturaAplicativoV2({
  children,
  items,
  atalhos,
  entradasBusca,
  unidadeNome,
  organizacaoAtual,
  organizacaoNome,
  organizacoes,
  usuarioEmail,
  usuarioNome,
}: Props) {
  const pathname = usePathname();
  // Só vale no desktop: no celular o menu é a gaveta, sempre com rótulos.
  const [recolhido, setRecolhido] = useState(false);
  // Folha do menu no celular guarda o caminho em que abriu: trocou de tela, fecha sozinha.
  const [gavetaEm, setGavetaEm] = useState<string | null>(null);
  const gavetaAberta = gavetaEm === pathname;
  const [filtro, setFiltro] = useState("");
  // Grupo que a pessoa abriu ou fechou na mão; sem escolha, abre só o da tela atual.
  const [alternados, setAlternados] = useState<Record<string, boolean>>({});
  // Com filtro, todos os grupos encontrados vêm abertos; estes foram fechados na mão.
  const [fechadosNoFiltro, setFechadosNoFiltro] = useState<Record<string, boolean>>({});
  const botaoMenuRef = useRef<HTMLButtonElement>(null);
  const botaoFecharRef = useRef<HTMLButtonElement>(null);
  // Arrastar a folha para baixo pela alça: quanto já desceu, em px.
  const [arrasto, setArrasto] = useState(0);
  const inicioArrasto = useRef<number | null>(null);
  // Folha acima do teclado (celular): base e altura medidas no `visualViewport`.
  // Sem ele, fica o CSS (rodapé da página, 85% da tela).
  const [posicaoGaveta, setPosicaoGaveta] = useState<PosicaoGaveta | null>(null);
  // Busca global guarda o caminho em que abriu, como a gaveta: trocou de tela, fecha.
  const [buscaEm, setBuscaEm] = useState<string | null>(null);
  const buscaAberta = buscaEm === pathname;

  // Módulo pelo subitem mais específico: "/estoque/setores" é de Cadastros, não do Estoque.
  const labelAtivo = moduloAtivo(items, pathname);
  const hrefAtivo = subitemAtivo(items, pathname);
  // Atalho da barra = módulo do menu: acende o do módulo da tela atual.
  const atalhoAtivo = atalhos.some((atalho) => atalho.label === labelAtivo) ? labelAtivo : undefined;
  const cabecalho = cabecalhoDoModulo(items, pathname);
  const filtrando = normalizarBusca(filtro) !== "";
  const visiveis = filtrarMenus(items, filtro);
  const variasOrganizacoes = organizacoes.length > 1;

  useEffect(() => {
    if (!gavetaAberta) return;
    botaoFecharRef.current?.focus();

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setGavetaEm(null);
      botaoMenuRef.current?.focus();
    }

    document.addEventListener("keydown", aoPressionarTecla);
    // Página parada atrás da folha: o iOS não rola o fundo ao focar o filtro.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoPressionarTecla);
      document.body.style.overflow = overflowAnterior;
    };
  }, [gavetaAberta]);

  // Teclado do celular: a folha fica com altura fixa logo acima dele, com o
  // filtro sempre visível no topo; só a lista de menus rola.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!gavetaAberta || !viewport) return;
    let quadro = 0;

    function atualizar() {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        setPosicaoGaveta(
          posicaoGavetaAcimaDoTeclado({
            alturaJanela: window.innerHeight,
            alturaVisivel: vv.height,
            deslocamentoTopo: vv.offsetTop,
          }),
        );
      });
    }

    atualizar();
    viewport.addEventListener("resize", atualizar);
    viewport.addEventListener("scroll", atualizar);
    return () => {
      cancelAnimationFrame(quadro);
      viewport.removeEventListener("resize", atualizar);
      viewport.removeEventListener("scroll", atualizar);
      setPosicaoGaveta(null);
    };
  }, [gavetaAberta]);

  function abrirBusca() {
    setGavetaEm(null);
    setBuscaEm(pathname);
  }

  // Ctrl+K (Cmd+K) em qualquer lugar e "/" fora de campo de texto abrem a busca.
  useEffect(() => {
    function aoPressionarTecla(evento: KeyboardEvent) {
      const alvo = evento.target as HTMLElement | null;
      const emCampoDeTexto = Boolean(
        alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)),
      );
      // Campos um a um: as propriedades do KeyboardEvent são getters do protótipo (o spread vem vazio).
      const { key, ctrlKey, metaKey, altKey } = evento;
      if (!teclaAbreBusca({ key, ctrlKey, metaKey, altKey, emCampoDeTexto })) return;
      evento.preventDefault();
      setGavetaEm(null);
      setBuscaEm(window.location.pathname);
    }
    document.addEventListener("keydown", aoPressionarTecla);
    return () => document.removeEventListener("keydown", aoPressionarTecla);
  }, []);

  function fecharGaveta() {
    setGavetaEm(null);
    setArrasto(0);
  }

  function comecarArrasto(evento: React.TouchEvent) {
    inicioArrasto.current = evento.touches[0].clientY;
  }

  function moverArrasto(evento: React.TouchEvent) {
    if (inicioArrasto.current === null) return;
    setArrasto(Math.max(0, evento.touches[0].clientY - inicioArrasto.current));
  }

  function terminarArrasto() {
    inicioArrasto.current = null;
    if (arrasto > 80) {
      fecharGaveta();
      botaoMenuRef.current?.focus();
    } else setArrasto(0);
  }

  function grupoAberto(label: string) {
    if (filtrando) return !fechadosNoFiltro[label];
    return alternados[label] ?? label === labelAtivo;
  }

  function alternarGrupo(label: string) {
    // Menu recolhido (só ícones): o clique expande o menu já com o grupo aberto.
    if (recolhido) {
      setRecolhido(false);
      setAlternados((atual) => ({ ...atual, [label]: true }));
      return;
    }
    const aberto = grupoAberto(label);
    if (filtrando) setFechadosNoFiltro((atual) => ({ ...atual, [label]: aberto }));
    else setAlternados((atual) => ({ ...atual, [label]: !aberto }));
  }

  function mudarFiltro(valor: string) {
    setFiltro(valor);
    setFechadosNoFiltro({});
  }

  // Classes que só valem com o menu recolhido no desktop.
  const someRecolhido = recolhido ? "lg:hidden" : "";
  const alinhamentoItem = recolhido ? "lg:justify-center" : "";

  return (
    // `data-tema-piloto`: só com este shell na tela o tema escuro vale (globals.css).
    <div data-tema-piloto="" className="group/app min-h-dvh">
      <a
        href="#conteudo-principal"
        className="fixed left-2 top-2 z-[60] -translate-y-20 rounded-md bg-ambar px-3 py-2 text-sm font-bold text-azul-noite transition-transform focus:translate-y-0 focus:outline-none"
      >
        Pular para o conteúdo
      </a>

      {gavetaAberta && (
        <div aria-hidden="true" onClick={fecharGaveta} className="fixed inset-0 z-40 bg-azul-noite/60 lg:hidden" />
      )}

      {/* Celular: folha que sobe do rodapé. Desktop (lg): menu fixo à esquerda. */}
      <aside
        id="menu-lateral"
        aria-label="Menu lateral"
        style={{
          ...(gavetaAberta && posicaoGaveta
            ? { "--gaveta-base": `${posicaoGaveta.base}px`, "--gaveta-altura": `${posicaoGaveta.altura}px` }
            : {}),
          ...(gavetaAberta && arrasto > 0 ? { transform: `translateY(${arrasto}px)`, transition: "none" } : {}),
        } as React.CSSProperties}
        // Altura fixa (não segue a quantidade de menus encontrados); no desktop as classes lg: mandam.
        className={`fixed inset-x-0 bottom-[var(--gaveta-base,0px)] z-50 flex h-[var(--gaveta-altura,85dvh)] flex-col rounded-t-2xl bg-azul-noite pb-[env(safe-area-inset-bottom)] text-branco shadow-xl transition-[translate,width,visibility] duration-200 lg:inset-y-0 lg:right-auto lg:z-40 lg:h-auto lg:translate-y-0 lg:visible lg:rounded-none lg:border-r lg:border-white/10 lg:pb-0 ${
          gavetaAberta ? "translate-y-0" : "invisible translate-y-full"
        } ${recolhido ? "lg:w-[5.5rem]" : "lg:w-64"}`}
      >
        {/* Alça da folha (só celular): arrastar para baixo fecha. */}
        <div
          onTouchStart={comecarArrasto}
          onTouchMove={moverArrasto}
          onTouchEnd={terminarArrasto}
          onTouchCancel={terminarArrasto}
          className="flex h-5 shrink-0 touch-none items-end justify-center lg:hidden"
        >
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-white/25" />
        </div>
        <div
          onTouchStart={comecarArrasto}
          onTouchMove={moverArrasto}
          onTouchEnd={terminarArrasto}
          onTouchCancel={terminarArrasto}
          className="relative flex h-14 shrink-0 items-center justify-center border-b border-white/10 px-2 lg:h-16"
        >
          <Link
            href="/painel"
            aria-label="Ir para o início do Zatti Hub"
            title="Zatti Hub"
            onClick={fecharGaveta}
            className="flex h-full items-center justify-center rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ambar"
          >
            <Image
              src="/brand/zatti-hub-horizontal.svg"
              alt="Zatti Hub"
              width={900}
              height={520}
              priority
              className={`h-auto w-28 ${someRecolhido}`}
            />
            <Image
              src="/brand/zatti-hub-simbolo.svg"
              alt=""
              width={96}
              height={96}
              priority
              className={`hidden h-11 w-11 ${recolhido ? "lg:block" : ""}`}
            />
          </Link>
          <button
            ref={botaoFecharRef}
            type="button"
            onClick={() => {
              fecharGaveta();
              botaoMenuRef.current?.focus();
            }}
            aria-label="Fechar menu"
            title="Fechar menu"
            className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:hidden"
          >
            <IconeNavegacao nome="fechar" className="h-5 w-5" />
          </button>
        </div>

        {/* Recolher (só desktop), na altura do cabeçalho: no menu atual fica em
            4.5rem, que aqui é a linha do filtro. */}
        <button
          type="button"
          onClick={() => {
            mudarFiltro("");
            setRecolhido((atual) => !atual);
          }}
          aria-label={recolhido ? "Expandir menu lateral" : "Recolher menu lateral"}
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          className="absolute -right-3 top-[1.125rem] z-50 hidden h-7 w-7 items-center justify-center rounded-full border border-cinza-claro bg-branco text-azul-noite shadow-md transition-colors hover:bg-off-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:flex"
        >
          <IconeNavegacao nome={recolhido ? "expandir" : "recolher"} className="h-4 w-4" />
        </button>

        {/* Busca global (só desktop; no celular é a lupa do cabeçalho). */}
        <div className="hidden shrink-0 px-3 pt-3 lg:block">
          <button
            type="button"
            onClick={abrirBusca}
            aria-label="Buscar menus e atalhos (Ctrl+K)"
            title="Buscar menus e atalhos (Ctrl+K)"
            className={`flex min-h-10 w-full items-center gap-2 rounded-lg border border-ambar/50 bg-ambar/10 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-ambar/20 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${recolhido ? "justify-center px-0" : ""}`}
          >
            <IconeNavegacao nome="buscar" className="h-4 w-4 shrink-0 text-ambar" />
            <span className={`min-w-0 flex-1 truncate text-left ${someRecolhido}`}>Buscar</span>
            <kbd className={`shrink-0 rounded border border-white/20 px-1.5 text-[10.5px] font-semibold text-white/60 ${someRecolhido}`}>
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className={`shrink-0 px-3 pt-3 ${someRecolhido}`}>
          <div className="relative">
            <IconeNavegacao
              nome="buscar"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
            />
            <input
              type="text"
              value={filtro}
              onChange={(evento) => mudarFiltro(evento.target.value)}
              onKeyDown={(evento) => {
                // Esc limpa o filtro primeiro; com ele vazio, fecha a gaveta.
                if (evento.key === "Escape" && filtro) {
                  evento.stopPropagation();
                  mudarFiltro("");
                }
              }}
              placeholder="Filtrar menus"
              aria-label="Filtrar menus"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-9 pr-10 text-base text-branco placeholder:text-white/45 focus:border-ambar focus:outline-none focus-visible:ring-1 focus-visible:ring-ambar lg:min-h-10 lg:text-sm"
            />
            {filtro && (
              <button
                type="button"
                onClick={() => mudarFiltro("")}
                aria-label="Limpar filtro de menus"
                title="Limpar filtro"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
              >
                <IconeNavegacao nome="fechar" className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <nav aria-label="Módulos do sistema" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
          {visiveis.length === 0 ? (
            <p className="px-3 py-4 text-sm text-white/60">Nenhum menu encontrado para &quot;{filtro.trim()}&quot;.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visiveis.map((item, indice) => {
                const ativo = item.label === labelAtivo;
                const classeBase = `flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${alinhamentoItem}`;

                if (item.disabled) {
                  return (
                    <li key={item.label}>
                      <div
                        aria-disabled="true"
                        title={`${item.label} - em breve`}
                        className={`${classeBase} cursor-not-allowed text-white/30`}
                      >
                        <IconeNavegacao nome={item.icone} className="h-5 w-5 shrink-0" />
                        <span className={`flex min-w-0 flex-1 items-center justify-between gap-2 ${someRecolhido}`}>
                          <span className="truncate">{item.label}</span>
                          <span className="text-[10px] font-semibold">em breve</span>
                        </span>
                      </div>
                    </li>
                  );
                }

                if (!item.sections) {
                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        aria-current={ativo ? "page" : undefined}
                        title={item.label}
                        onClick={fecharGaveta}
                        className={`${classeBase} ${
                          ativo ? "bg-ambar font-bold text-azul-noite" : "text-white/75 hover:bg-white/10 hover:text-branco"
                        }`}
                      >
                        <IconeNavegacao nome={item.icone} className="h-5 w-5 shrink-0" />
                        <span className={`min-w-0 flex-1 truncate text-left ${someRecolhido}`}>{item.label}</span>
                      </Link>
                    </li>
                  );
                }

                const aberto = grupoAberto(item.label);
                const idGrupo = `grupo-menu-${indice}`;
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      aria-expanded={aberto}
                      aria-controls={idGrupo}
                      title={item.label}
                      onClick={() => alternarGrupo(item.label)}
                      className={`${classeBase} ${
                        ativo
                          ? `bg-white/10 font-semibold text-ambar ${recolhido ? "lg:bg-ambar lg:text-azul-noite" : ""}`
                          : "text-white/75 hover:bg-white/10 hover:text-branco"
                      }`}
                    >
                      <IconeNavegacao nome={item.icone} className="h-5 w-5 shrink-0" />
                      <span className={`min-w-0 flex-1 truncate text-left ${someRecolhido}`}>{item.label}</span>
                      <IconeNavegacao
                        nome="seta"
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${aberto ? "rotate-180" : ""} ${someRecolhido}`}
                      />
                    </button>
                    {aberto && (
                      <div id={idGrupo} className={`ml-5 mt-1 mb-2 border-l border-white/10 pl-2 ${someRecolhido}`}>
                        {item.sections.map((secao) => (
                          <SecaoSanfona
                            key={secao.label}
                            secao={secao}
                            modulo={item.label}
                            hrefAtivo={hrefAtivo}
                            aoNavegar={fecharGaveta}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* Com o teclado aberto no celular, conta e Sair saem para sobrar espaço à lista. */}
        <div className={`shrink-0 border-t border-white/10 p-2 ${gavetaAberta && posicaoGaveta?.tecladoAberto ? "hidden lg:block" : ""}`}>
          {/* Uma linha só (tela baixa): inicial de quem está logado + organização
              com o seletor de troca. Nome e e-mail ficam no título da inicial. */}
          <div className={`mb-1 flex min-h-11 items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 ${someRecolhido}`}>
            <span
              title={`${usuarioNome || "Conta ativa"}${usuarioEmail ? ` (${usuarioEmail})` : ""}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ambar text-xs font-bold text-azul-noite"
            >
              <span aria-hidden="true">{(usuarioNome || usuarioEmail || "?").charAt(0).toUpperCase()}</span>
              <span className="sr-only">Usuário: {usuarioNome || usuarioEmail || "Conta ativa"}</span>
            </span>
            <div className="min-w-0 flex-1">
              {variasOrganizacoes ? (
                <OrgSwitcher organizacoes={organizacoes} atual={organizacaoAtual} />
              ) : (
                <p className="truncate text-xs font-medium text-branco" title={organizacaoNome}>
                  <span className="sr-only">Organização: </span>
                  {organizacaoNome}
                </p>
              )}
            </div>
          </div>

          {/* Tema da tela (fase 7): preferência deste usuário neste aparelho. */}
          <AlternadorTema usuario={usuarioEmail || usuarioNome || ""} className={someRecolhido} />

          {/* Recolhido no desktop: a inicial da organização expande o menu para trocar de cliente. */}
          <button
            type="button"
            aria-label={`Organização: ${organizacaoNome}`}
            title={organizacaoNome}
            onClick={() => setRecolhido(false)}
            className={`mb-1 hidden min-h-11 w-full items-center justify-center rounded-lg px-3 py-2.5 text-white/75 transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
              recolhido ? "lg:flex" : ""
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ambar text-xs font-bold text-azul-noite">
              {organizacaoNome.charAt(0).toUpperCase() || "?"}
            </span>
          </button>

          {/* Sair limpa os rascunhos de Contagem/Desempenho deste aparelho. */}
          <form action={signOutAction} onSubmit={limparTodosRascunhos}>
            <button
              type="submit"
              aria-label="Sair"
              title="Sair"
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-branco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${alinhamentoItem}`}
            >
              <IconeNavegacao nome="sair" className="h-5 w-5 shrink-0" />
              <span className={someRecolhido}>Sair</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Celular: espaço no fim para o conteúdo não ficar atrás da barra inferior
          (sem barra no modo foco, onde a própria tela tem botões no rodapé). */}
      <div
        className={`flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] transition-[padding-left] duration-200 group-has-[[data-modo-foco]]/app:pb-0 lg:pb-0 ${recolhido ? "lg:pl-[5.5rem]" : "lg:pl-64"}`}
      >
        <main
          id="conteudo-principal"
          tabIndex={-1}
          // Com cabeçalho de módulo, o h1 repetido da página some (globals.css).
          data-cabecalho-modulo={cabecalho ? "" : undefined}
          className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-6 lg:py-6"
        >
          <NavegacaoV2Provider>
            <BuscaGlobalProvider abrir={abrirBusca}>
              {cabecalho && <CabecalhoModuloV2 cabecalho={cabecalho} unidadeNome={unidadeNome} />}
              {children}
            </BuscaGlobalProvider>
          </NavegacaoV2Provider>
        </main>
        <footer className="border-t border-cinza-claro bg-branco px-3 py-4 text-center text-xs text-cinza-medio">
          Powered by <span className="font-semibold text-azul-petroleo">Zatti Consultoria</span>
        </footer>
      </div>

      {buscaAberta && <BuscaGlobal entradas={entradasBusca} aoFechar={() => setBuscaEm(null)} />}

      <nav
        aria-label="Atalhos"
        className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-cinza-claro bg-branco pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(13,31,45,0.08)] group-has-[[data-modo-foco]]/app:hidden lg:hidden"
      >
        <ul
          className="mx-auto grid max-w-lg gap-1 px-2 pb-1.5 pt-1.5"
          style={{ gridTemplateColumns: `repeat(${atalhos.length + 1}, minmax(0, 1fr))` }}
        >
          {atalhos.map((atalho) => {
            const ativo = atalho.label === atalhoAtivo;
            return (
              <li key={atalho.href}>
                <Link href={atalho.href} aria-current={ativo ? "page" : undefined} className={classeBotaoBarra(ativo)}>
                  <IconeNavegacao nome={atalho.icone} className={classeIconeBarra(ativo)} />
                  <span className={classeRotuloBarra(ativo)}>{atalho.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={botaoMenuRef}
              type="button"
              onClick={() => setGavetaEm(pathname)}
              aria-label="Abrir menu completo"
              aria-expanded={gavetaAberta}
              aria-controls="menu-lateral"
              className={classeBotaoBarra(gavetaAberta)}
            >
              <IconeNavegacao nome="menu" className={classeIconeBarra(gavetaAberta)} />
              <span className={classeRotuloBarra(gavetaAberta)}>Menu</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

// Barra inferior: ativo com fundo âmbar bem claro atrás do ícone e do rótulo.
function classeBotaoBarra(ativo: boolean) {
  return `flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar ${
    ativo ? "bg-ambar/15" : "hover:bg-off-white"
  }`;
}

function classeIconeBarra(ativo: boolean) {
  return `h-6 w-6 shrink-0 ${ativo ? "text-ambar" : "text-azul-noite"}`;
}

function classeRotuloBarra(ativo: boolean) {
  return `max-w-full truncate text-[11px] leading-tight ${ativo ? "font-bold text-azul-noite" : "font-medium text-cinza-medio"}`;
}

function SecaoSanfona({
  secao,
  modulo,
  hrefAtivo,
  aoNavegar,
}: {
  secao: SecaoNavegacao;
  modulo: string;
  hrefAtivo: string | undefined;
  aoNavegar: () => void;
}) {
  // Seção de um item só com o mesmo nome (ex.: Setores) vira link direto, sem título repetido;
  // seção com o nome do próprio módulo (Início, Relatórios) também não repete o título.
  const semTitulo = (secao.items.length === 1 && secao.items[0].label === secao.label) || secao.label === modulo;
  return (
    <div className="mt-1 first:mt-0">
      {!semTitulo && (
        <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
          {secao.label}
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {secao.items.map((sub) => {
          const ativo = sub.href === hrefAtivo;
          return (
            <li key={sub.href}>
              <Link
                href={sub.href}
                aria-current={ativo ? "page" : undefined}
                onClick={aoNavegar}
                className={`flex min-h-11 items-center rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:min-h-9 ${
                  ativo ? "bg-ambar font-semibold text-azul-noite" : "text-white/75 hover:bg-white/10 hover:text-branco"
                }`}
              >
                {sub.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
