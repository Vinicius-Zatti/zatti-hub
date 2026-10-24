"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { IconeNavegacao } from "@/components/icones-navegacao";
import { comContagemBase, type AbaModulo, type CabecalhoModulo } from "@/lib/navegacao/abas";

// Navegação V2 (24/10/2026), desenho aprovado em `navegacao-v2-desenho.html`:
// título da tela com o módulo embaixo, seta que volta para a entrada do módulo
// e as abas das telas irmãs numa barra branca arredondada, presa no topo ao
// rolar. Quando as abas não cabem aparecem setas nas pontas e a aba ativa abre
// centralizada. Telas em modo foco (Contagem em andamento, preenchimento do
// Garante) têm a própria barra presa no topo: lá o cabeçalho rola junto.

export function CabecalhoModuloV2({ cabecalho, unidadeNome }: { cabecalho: CabecalhoModulo; unidadeNome: string }) {
  const { modulo, entrada, abas, abaAtiva, naEntrada, titulo } = cabecalho;
  return (
    <div className="sticky top-0 z-30 -mx-3 -mt-5 mb-4 bg-off-white px-3 pt-3 group-has-[[data-modo-foco]]/app:static sm:-mx-6 sm:px-6 lg:-mt-6">
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
        <div className="min-w-0">
          <p className="truncate text-[19px] font-bold leading-tight text-azul-noite">{titulo}</p>
          <p className="truncate text-xs text-cinza-medio">{naEntrada ? unidadeNome : modulo}</p>
        </div>
      </div>
      {abas.length > 1 && (
        // `?data=` das abas de Pedidos vem da URL: sem Suspense, a leitura dos
        // parâmetros jogaria a árvore inteira para o navegador.
        <Suspense fallback={<TrilhoAbas modulo={modulo} abas={abas} abaAtiva={abaAtiva} />}>
          <TrilhoAbasComData modulo={modulo} abas={abas} abaAtiva={abaAtiva} />
        </Suspense>
      )}
    </div>
  );
}

type PropsTrilho = { modulo: string; abas: AbaModulo[]; abaAtiva: string | undefined };

function TrilhoAbasComData(props: PropsTrilho) {
  const data = useSearchParams().get("data");
  return <TrilhoAbas {...props} abas={comContagemBase(props.abas, data)} />;
}

function TrilhoAbas({ modulo, abas, abaAtiva }: PropsTrilho) {
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
      aria-label={`Telas de ${modulo}`}
      className="flex items-center gap-1 rounded-[14px] border border-cinza-claro bg-branco p-1 shadow-[0_2px_6px_rgba(13,31,45,0.06)]"
    >
      <BotaoSeta direcao="esquerda" visivel={setas.esquerda} aoClicar={() => rolar(-1)} />
      <div
        ref={trilhoRef}
        onScroll={atualizarSetas}
        className="relative flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {abas.map((aba) => {
          const ativa = aba.href.split("?")[0] === abaAtiva;
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={ativa ? "page" : undefined}
              className={`flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ambar ${
                ativa ? "bg-azul-noite text-branco" : "text-cinza-medio hover:text-azul-noite"
              }`}
            >
              {aba.label}
            </Link>
          );
        })}
      </div>
      <BotaoSeta direcao="direita" visivel={setas.direita} aoClicar={() => rolar(1)} />
    </nav>
  );
}

function BotaoSeta({ direcao, visivel, aoClicar }: { direcao: "esquerda" | "direita"; visivel: boolean; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={direcao === "esquerda" ? "Ver abas anteriores" : "Ver mais abas"}
      title={direcao === "esquerda" ? "Ver abas anteriores" : "Ver mais abas"}
      className={`${visivel ? "flex" : "hidden"} h-10 w-7 shrink-0 items-center justify-center rounded-lg bg-ambar/15 text-azul-noite transition-colors hover:bg-ambar/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar`}
    >
      <IconeNavegacao nome="seta" className={`h-4 w-4 ${direcao === "esquerda" ? "rotate-90" : "-rotate-90"}`} />
    </button>
  );
}
