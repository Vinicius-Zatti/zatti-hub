"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { IconeNavegacao } from "@/components/icones-navegacao";
import { BotaoBuscaGlobal } from "@/components/navegacao-v2/busca-global";
import { BotaoReverTour } from "@/components/navegacao-v2/tour-modulo";
import { comContagemBase, type AbaModulo, type CabecalhoModulo } from "@/lib/navegacao/abas";

// Navegação V2 (24/10/2026), desenho aprovado em `navegacao-v2-desenho.html`:
// título da tela com o módulo embaixo, seta que volta para a entrada do módulo
// e as abas das telas irmãs numa barra branca arredondada, presa no topo ao
// rolar. Quando as abas não cabem aparecem setas nas pontas e a aba ativa abre
// centralizada. Dois níveis (24/10): a barra principal tem as seções do módulo
// e, quando a seção atual tem mais de uma tela, uma linha menor logo abaixo
// (texto com sublinhado âmbar) lista as telas dela, presa no topo junto. Telas em modo foco (Contagem em andamento, preenchimento do
// Garante) têm a própria barra presa no topo: lá o cabeçalho rola junto.

export function CabecalhoModuloV2({ cabecalho, unidadeNome }: { cabecalho: CabecalhoModulo; unidadeNome: string }) {
  const { modulo, entrada, abas, abaAtiva, subAbas, subAbaAtiva, naEntrada, titulo } = cabecalho;
  return (
    <div data-tour="cabecalho-modulo" className="sticky top-0 z-30 -mx-3 -mt-5 mb-4 bg-off-white px-3 pt-3 group-has-[[data-modo-foco]]/app:static sm:-mx-6 sm:px-6 lg:-mt-6">
      <div className="flex items-center gap-2 px-0.5 pb-2">
        {!naEntrada && (
          <Link
            href={entrada}
            aria-label={`Voltar para ${modulo}`}
            title={`Voltar para ${modulo}`}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-cinza-claro bg-branco text-azul-noite transition-colors hover:border-ambar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
          >
            <IconeNavegacao nome="seta" className="h-5 w-5 rotate-90" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-bold leading-tight text-azul-noite">{titulo}</p>
          <p className="truncate text-xs text-cinza-medio">{naEntrada ? unidadeNome : modulo}</p>
        </div>
        {/* Rever o tour do primeiro acesso (fase 4) e lupa da busca global (só celular). */}
        <BotaoReverTour />
        <BotaoBuscaGlobal />
      </div>
      {abas.length > 1 && (
        // `?data=` das abas de Pedidos vem da URL: sem Suspense, a leitura dos
        // parâmetros jogaria a árvore inteira para o navegador.
        <Suspense fallback={<TrilhoAbas modulo={modulo} abas={abas} abaAtiva={abaAtiva} />}>
          <TrilhoAbasComData modulo={modulo} abas={abas} abaAtiva={abaAtiva} />
        </Suspense>
      )}
      {subAbas.length > 1 && (
        <div className="mt-1.5">
          <Suspense fallback={<TrilhoAbas modulo={modulo} abas={subAbas} abaAtiva={subAbaAtiva} secundario />}>
            <TrilhoAbasComData modulo={modulo} abas={subAbas} abaAtiva={subAbaAtiva} secundario />
          </Suspense>
        </div>
      )}
    </div>
  );
}

type PropsTrilho = {
  modulo: string;
  abas: AbaModulo[];
  abaAtiva: string | undefined;
  /** Nível 2: linha menor e discreta com as telas da seção atual. */
  secundario?: boolean;
};

function TrilhoAbasComData(props: PropsTrilho) {
  const data = useSearchParams().get("data");
  return <TrilhoAbas {...props} abas={comContagemBase(props.abas, data)} />;
}

function TrilhoAbas({ modulo, abas, abaAtiva, secundario = false }: PropsTrilho) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [setas, setSetas] = useState({ esquerda: false, direita: false });

  const atualizarSetas = useCallback(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const esquerda = trilho.scrollLeft > 4;
    const direita = trilho.scrollLeft + trilho.clientWidth < trilho.scrollWidth - 4;
    setSetas((atual) => (atual.esquerda === esquerda && atual.direita === direita ? atual : { esquerda, direita }));
  }, []);

  // Aba ativa centralizada ao abrir a tela (só o trilho rola, nunca a página).
  useEffect(() => {
    const trilho = trilhoRef.current;
    const ativa = trilho?.querySelector<HTMLElement>("[aria-current='page']");
    if (trilho && ativa) trilho.scrollLeft = ativa.offsetLeft - (trilho.clientWidth - ativa.offsetWidth) / 2;
    atualizarSetas();
  }, [abaAtiva, atualizarSetas]);

  useEffect(() => {
    const trilho = trilhoRef.current;
    if (!trilho) return;
    const observador = new ResizeObserver(atualizarSetas);
    observador.observe(trilho);
    return () => observador.disconnect();
  }, [atualizarSetas]);

  function rolar(sentido: 1 | -1) {
    trilhoRef.current?.scrollBy({ left: sentido * 160, behavior: "smooth" });
  }

  return (
    <nav
      aria-label={secundario ? `Telas da seção de ${modulo}` : `Seções de ${modulo}`}
      data-tour={secundario ? "subabas-modulo" : "abas-modulo"}
      className={
        secundario
          ? "flex items-center gap-1 px-0.5"
          : "flex items-center gap-1 rounded-[14px] border border-cinza-claro bg-branco p-1 shadow-[0_2px_6px_rgba(13,31,45,0.06)]"
      }
    >
      <BotaoSeta direcao="esquerda" visivel={setas.esquerda} aoClicar={() => rolar(-1)} secundario={secundario} />
      <div
        ref={trilhoRef}
        onScroll={atualizarSetas}
        className={`relative flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          secundario ? "gap-4 px-1" : "gap-1"
        }`}
      >
        {abas.map((aba) => {
          const ativa = aba.href.split("?")[0] === abaAtiva;
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={ativa ? "page" : undefined}
              className={
                secundario
                  ? `flex min-h-9 shrink-0 items-center whitespace-nowrap border-b-2 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ambar ${
                      ativa ? "border-ambar text-azul-noite" : "border-transparent text-cinza-medio hover:text-azul-noite"
                    }`
                  : `flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ambar ${
                      ativa ? "bg-azul-noite text-branco" : "text-cinza-medio hover:text-azul-noite"
                    }`
              }
            >
              {aba.label}
            </Link>
          );
        })}
      </div>
      <BotaoSeta direcao="direita" visivel={setas.direita} aoClicar={() => rolar(1)} secundario={secundario} />
    </nav>
  );
}

function BotaoSeta({
  direcao,
  visivel,
  aoClicar,
  secundario = false,
}: {
  direcao: "esquerda" | "direita";
  visivel: boolean;
  aoClicar: () => void;
  secundario?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={direcao === "esquerda" ? "Ver abas anteriores" : "Ver mais abas"}
      title={direcao === "esquerda" ? "Ver abas anteriores" : "Ver mais abas"}
      className={`${visivel ? "flex" : "hidden"} ${secundario ? "h-8 w-6" : "h-10 w-7"} shrink-0 items-center justify-center rounded-lg bg-ambar/15 text-azul-noite transition-colors hover:bg-ambar/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar`}
    >
      <IconeNavegacao nome="seta" className={`h-4 w-4 ${direcao === "esquerda" ? "rotate-90" : "-rotate-90"}`} />
    </button>
  );
}
