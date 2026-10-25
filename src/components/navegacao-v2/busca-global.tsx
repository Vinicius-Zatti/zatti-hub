"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { IconeNavegacao } from "@/components/icones-navegacao";
import { buscarEntradas, type EntradaBusca } from "@/lib/navegacao/busca";

// Busca global do piloto (Navegação V2, fase 3, 24/10/2026), no formato do
// benchmark que Vinícius aprovou ("Buscar menus e atalhos"). Desktop: caixa
// sobre a tela, aberta por Ctrl+K, "/" ou pelo botão do menu. Celular: tela
// cheia aberta pela lupa do cabeçalho, com o campo preso no topo. A altura é
// fixa (nunca segue a quantidade de resultados) e, no celular, vem do
// `visualViewport`: com o teclado aberto a busca termina logo acima dele
// (mesmo aprendizado da gaveta do menu, `lib/navegacao/gaveta-teclado.ts`).

const BuscaGlobalContexto = createContext<(() => void) | null>(null);

export function BuscaGlobalProvider({ abrir, children }: { abrir: () => void; children: React.ReactNode }) {
  return <BuscaGlobalContexto value={abrir}>{children}</BuscaGlobalContexto>;
}

/** Lupa do cabeçalho do módulo (só celular; no desktop há Ctrl+K e o botão do menu). */
export function BotaoBuscaGlobal({ className = "" }: { className?: string }) {
  const abrir = useContext(BuscaGlobalContexto);
  if (!abrir) return null;
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Buscar menus e atalhos"
      title="Buscar menus e atalhos"
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-cinza-claro bg-branco text-azul-noite transition-colors hover:border-ambar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:hidden ${className}`}
    >
      <IconeNavegacao nome="buscar" className="h-[18px] w-[18px]" />
    </button>
  );
}

type Medidas = { topo: number; altura: number } | null;

export function BuscaGlobal({ entradas, aoFechar }: { entradas: EntradaBusca[]; aoFechar: () => void }) {
  const [termo, setTermo] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [medidas, setMedidas] = useState<Medidas>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);
  const idLista = useId();
  const resultados = buscarEntradas(entradas, termo);
  const indiceAtivo = resultados.length === 0 ? -1 : Math.min(ativo, resultados.length - 1);

  // Foco no campo ao abrir; ao fechar, volta para quem estava focado antes.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    campoRef.current?.focus();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Esc fecha mesmo com o foco fora do campo (ex.: depois de rolar a lista).
    function aoTeclarFora(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFecharRef.current();
    }
    document.addEventListener("keydown", aoTeclarFora);
    return () => {
      document.removeEventListener("keydown", aoTeclarFora);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus?.();
    };
  }, []);

  // Celular: topo e altura da área visível (acima do teclado), nunca da lista.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let quadro = 0;
    function atualizar() {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        if (vv) setMedidas({ topo: Math.round(vv.offsetTop), altura: Math.round(vv.height) });
      });
    }
    atualizar();
    viewport.addEventListener("resize", atualizar);
    viewport.addEventListener("scroll", atualizar);
    return () => {
      cancelAnimationFrame(quadro);
      viewport.removeEventListener("resize", atualizar);
      viewport.removeEventListener("scroll", atualizar);
    };
  }, []);

  // Abrir um resultado é sempre um clique no <a> dele (mouse, toque ou Enter):
  // assim as guardas de saída (Contagem em andamento, edição sem salvar), que
  // escutam clique em link na captura do `document`, valem aqui também. Elas
  // param a propagação, então o fechamento não pode depender do onClick do
  // Link: este ouvinte na captura do `window` roda antes delas e fecha a busca
  // logo depois, com ou sem a confirmação aparecendo.
  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      const link = (evento.target as HTMLElement | null)?.closest?.("a");
      if (!link || !listaRef.current?.contains(link)) return;
      setTimeout(() => aoFecharRef.current(), 0);
    }
    window.addEventListener("click", aoClicar, true);
    return () => window.removeEventListener("click", aoClicar, true);
  }, []);

  // Resultado ativo sempre visível ao andar pelas setas (só a lista rola).
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [indiceAtivo]);

  function abrirResultado(indice: number) {
    document.getElementById(idOpcao(indice))?.querySelector<HTMLAnchorElement>("a")?.click();
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      aoFechar();
      return;
    }
    if (resultados.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAtivo((indiceAtivo + 1) % resultados.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setAtivo((indiceAtivo - 1 + resultados.length) % resultados.length);
    } else if (evento.key === "Enter" && indiceAtivo >= 0) {
      evento.preventDefault();
      abrirResultado(indiceAtivo);
    }
  }

  const idOpcao = (indice: number) => `${idLista}-opcao-${indice}`;
  const semTermo = termo.trim() === "";

  return (
    <>
      <div aria-hidden="true" onClick={aoFechar} className="fixed inset-0 z-[70] hidden bg-azul-noite/50 lg:block" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar menus e atalhos"
        style={
          medidas
            ? ({ "--busca-topo": `${medidas.topo}px`, "--busca-altura": `${medidas.altura}px` } as React.CSSProperties)
            : undefined
        }
        // Celular: tela cheia na área visível. Desktop: caixa centralizada de altura fixa.
        className="fixed inset-x-0 top-[var(--busca-topo,0px)] z-[71] flex h-[var(--busca-altura,100dvh)] flex-col bg-branco lg:inset-x-auto lg:left-1/2 lg:top-[12vh] lg:h-[min(34rem,76vh)] lg:w-[min(40rem,calc(100vw-2rem))] lg:-translate-x-1/2 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-cinza-claro lg:shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-cinza-claro px-3 py-2.5">
          <div className="relative min-w-0 flex-1">
            <IconeNavegacao
              nome="buscar"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cinza-medio"
            />
            <input
              ref={campoRef}
              type="text"
              role="combobox"
              aria-expanded={resultados.length > 0}
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={indiceAtivo >= 0 ? idOpcao(indiceAtivo) : undefined}
              value={termo}
              onChange={(evento) => {
                setTermo(evento.target.value);
                setAtivo(0);
              }}
              onKeyDown={aoTeclar}
              placeholder="Buscar menus e atalhos"
              aria-label="Buscar menus e atalhos"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              className="min-h-11 w-full rounded-lg border border-cinza-claro bg-off-white py-2 pl-9 pr-3 text-base text-azul-noite placeholder:text-cinza-medio focus:border-ambar focus:outline-none focus-visible:ring-1 focus-visible:ring-ambar lg:text-sm"
            />
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="min-h-11 shrink-0 rounded-lg px-2.5 text-sm font-semibold text-azul-petroleo hover:bg-off-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar lg:hidden"
          >
            Fechar
          </button>
          <kbd className="hidden shrink-0 rounded border border-cinza-claro px-1.5 py-0.5 text-[11px] font-semibold text-cinza-medio lg:block">
            Esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-cinza-medio">
            {semTermo ? "Atalhos" : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}`}
          </p>
          {resultados.length === 0 ? (
            <p className="px-2 py-4 text-sm text-cinza-medio">
              {semTermo ? "Nenhum atalho disponível." : `Nada encontrado para "${termo.trim()}".`}
            </p>
          ) : (
            <ul ref={listaRef} id={idLista} role="listbox" aria-label="Resultados da busca" className="flex flex-col gap-0.5">
              {resultados.map((item, indice) => {
                const selecionado = indice === indiceAtivo;
                return (
                  <li key={`${item.tipo}-${item.href}`} id={idOpcao(indice)} role="option" aria-selected={selecionado}>
                    <Link
                      href={item.href}
                      tabIndex={-1}
                      onMouseMove={() => !selecionado && setAtivo(indice)}
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
                        selecionado ? "bg-ambar/15" : "hover:bg-off-white"
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ambar/15 text-azul-noite">
                        <IconeNavegacao nome={item.icone} className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-azul-noite">{item.titulo}</span>
                        <span className="block truncate text-xs text-cinza-medio">
                          {item.tipo === "acao" ? item.descricao : item.caminho || "Menu"}
                        </span>
                      </span>
                      {item.tipo === "acao" && (
                        <span className="shrink-0 rounded-full bg-azul-noite px-2 py-0.5 text-[10.5px] font-semibold text-branco">
                          Atalho
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="hidden shrink-0 items-center gap-3 border-t border-cinza-claro px-4 py-2 text-[11px] text-cinza-medio lg:flex">
          <span><kbd className="font-semibold">↑ ↓</kbd> navegar</span>
          <span><kbd className="font-semibold">Enter</kbd> abrir</span>
          <span><kbd className="font-semibold">Esc</kbd> fechar</span>
        </p>
      </div>
    </>
  );
}
