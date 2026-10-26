"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconeNavegacao } from "@/components/icones-navegacao";
import { teclaAbreBusca } from "@/lib/navegacao/busca";
import { marcarTourVistoAction } from "@/lib/tour/actions";
import {
  deveMostrarTour,
  ehUltimoPasso,
  moduloTourDoRotulo,
  passosVisiveis,
  posicionarBalaoTour,
  textoContador,
  type PosicaoBalaoTour,
} from "@/lib/tour/passos";
import { ROTEIROS_TOUR, type ModuloTour, type PassoTour } from "@/lib/tour/roteiros";
import { CartaoBoasVindas } from "@/components/videos-ajuda";
import { CHAVE_VIDEO_BOAS_VINDAS, deveOferecerBoasVindas, proximoAvisoPrimeiroAcesso } from "@/lib/videos-ajuda/regras";

// Tour no primeiro acesso de cada módulo (Navegação V2, fase 4, 25/10/2026),
// só no piloto. Aparece sozinho UMA vez por usuário e módulo (gravado em
// `tours_vistos` assim que abre) e depois só pelo botão "Rever o tour" do
// cabeçalho. Textos e alvos em `lib/tour/roteiros.ts`; posição e regras em
// `lib/tour/passos.ts`. Alvo ausente na tela: o passo é pulado. Sem leitura do
// banco (`vistos === null`, ex.: migration não aplicada) não abre sozinho.
// Não abre em tela em modo foco (Contagem, preenchimento do Garante), em tela
// marcada com `data-sem-tour` (começo da Contagem) nem com modal ou busca
// abertos. Com o tour aberto, Ctrl+K e "/" não abrem a busca por baixo dele.
// Avisos do primeiro acesso, um de cada vez (26/10/2026): tour, depois o cartão
// do vídeo de boas-vindas (oferecido uma vez, gravado em `tours_vistos`) e só
// então o convite de instalar o app (`lib/videos-ajuda/regras.ts`).

const ESPERA_ABRIR_MS = 800;
// Depois do tour (ou na primeira tela sem tour), o cartão espera a tela assentar.
const ESPERA_BOAS_VINDAS_MS = 1200;
const BLOQUEIOS_AVISO = "[data-modo-foco], [data-sem-tour], [data-modal-flutuante], [aria-modal='true']";

const ReverTourContexto = createContext<(() => void) | null>(null);
// Fora do shell da Navegação V2 não há tour nem cartão: o convite fica liberado.
const ConviteLiberadoContexto = createContext(true);

/** Abre de novo o tour do módulo atual; null fora do piloto ou sem tour. */
export function useReverTour() {
  return useContext(ReverTourContexto);
}

/** O convite de instalar só aparece depois do tour e do cartão de boas-vindas. */
export function useConviteInstalarLiberado() {
  return useContext(ConviteLiberadoContexto);
}

type TourAberto = { modulo: ModuloTour; passos: PassoTour[]; indice: number; em: string };

export function TourModuloProvider({
  rotuloModulo,
  vistos,
  children,
}: {
  rotuloModulo: string | undefined;
  vistos: string[] | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const modulo = moduloTourDoRotulo(rotuloModulo);
  // Cópia local: o layout não recarrega a cada tela, então o "já visto" desta
  // sessão fica aqui (e no banco, para as próximas).
  const [vistosLocal, setVistosLocal] = useState<ReadonlySet<string> | null>(() => (vistos ? new Set(vistos) : null));
  const [tour, setTour] = useState<TourAberto | null>(null);
  // Trocou de tela no meio do tour (clique num link): o tour fecha.
  const tourAtivo = tour && tour.em === pathname ? tour : null;

  const abrir = useCallback((alvoModulo: ModuloTour, gravar: boolean) => {
    const passos = passosVisiveis(ROTEIROS_TOUR[alvoModulo], (alvos) => acharAlvo(alvos) !== null);
    if (passos.length === 0) return;
    setTour({ modulo: alvoModulo, passos, indice: 0, em: window.location.pathname });
    if (!gravar) return;
    setVistosLocal((atual) => new Set([...(atual ?? []), alvoModulo]));
    void marcarTourVistoAction(alvoModulo).then((resultado) => {
      if (!resultado.ok) console.warn("[tour] não gravou o tour visto de", alvoModulo);
    });
  }, []);

  useEffect(() => {
    if (tourAtivo || !deveMostrarTour(modulo, vistosLocal) || !modulo) return;
    // Espera a tela assentar (abas, blocos e listas chegam por streaming).
    const espera = window.setTimeout(() => {
      if (document.querySelector("[data-modo-foco], [data-sem-tour], [data-modal-flutuante], [aria-modal='true']")) return;
      abrir(modulo, true);
    }, ESPERA_ABRIR_MS);
    return () => window.clearTimeout(espera);
  }, [modulo, pathname, vistosLocal, tourAtivo, abrir]);

  // Tour aberto: o atalho da busca (Ctrl+K, "/") para aqui, na captura do
  // window, antes do ouvinte do shell no document.
  const tourAberto = tourAtivo !== null;
  useEffect(() => {
    if (!tourAberto) return;
    function bloquearBusca(evento: KeyboardEvent) {
      const { key, ctrlKey, metaKey, altKey } = evento;
      if (!teclaAbreBusca({ key, ctrlKey, metaKey, altKey, emCampoDeTexto: false })) return;
      evento.preventDefault();
      evento.stopPropagation();
    }
    window.addEventListener("keydown", bloquearBusca, true);
    return () => window.removeEventListener("keydown", bloquearBusca, true);
  }, [tourAberto]);

  const rever = useCallback(() => {
    if (modulo) abrir(modulo, false);
  }, [modulo, abrir]);

  // Cartão do vídeo de boas-vindas: depois do tour, uma vez por usuário. Grava
  // ao aparecer (como o tour), então "Agora não" ou fechar a aba não o traz de volta.
  const [cartaoBoasVindas, setCartaoBoasVindas] = useState(false);
  const tourPendente = tourAtivo !== null || deveMostrarTour(modulo, vistosLocal);
  const proximo = proximoAvisoPrimeiroAcesso({
    tourPendente,
    boasVindasPendente: cartaoBoasVindas || deveOferecerBoasVindas(vistosLocal),
    conviteElegivel: true,
  });

  useEffect(() => {
    if (proximo !== "boas-vindas" || cartaoBoasVindas) return;
    const espera = window.setTimeout(() => {
      if (document.querySelector(BLOQUEIOS_AVISO)) return;
      setCartaoBoasVindas(true);
      setVistosLocal((atual) => new Set([...(atual ?? []), CHAVE_VIDEO_BOAS_VINDAS]));
      void marcarTourVistoAction(CHAVE_VIDEO_BOAS_VINDAS).then((resultado) => {
        if (!resultado.ok) console.warn("[tour] não gravou o cartão de boas-vindas visto");
      });
    }, ESPERA_BOAS_VINDAS_MS);
    return () => window.clearTimeout(espera);
  }, [proximo, cartaoBoasVindas, pathname]);

  return (
    <ReverTourContexto.Provider value={modulo ? rever : null}>
      <ConviteLiberadoContexto.Provider value={proximo === "instalar"}>
      {children}
      {cartaoBoasVindas && createPortal(<CartaoBoasVindas aoFechar={() => setCartaoBoasVindas(false)} />, document.body)}
      {tourAtivo &&
        createPortal(
          <BalaoTour
            key={tourAtivo.modulo}
            passos={tourAtivo.passos}
            indice={tourAtivo.indice}
            aoProximo={() =>
              setTour((atual) =>
                atual && !ehUltimoPasso(atual.indice, atual.passos.length) ? { ...atual, indice: atual.indice + 1 } : null,
              )
            }
            aoFechar={() => setTour(null)}
          />,
          document.body,
        )}
      </ConviteLiberadoContexto.Provider>
    </ReverTourContexto.Provider>
  );
}

/** Primeiro elemento visível entre os seletores do passo. */
function acharAlvo(seletores: readonly string[]): HTMLElement | null {
  for (const seletor of seletores) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(seletor))) {
      const caixa = el.getBoundingClientRect();
      if (caixa.width === 0 || caixa.height === 0) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      return el;
    }
  }
  return null;
}

// Alvos que não rolam com a página (menu, barra de baixo, cabeçalho preso no topo).
const FIXOS = '#menu-lateral, nav[aria-label="Atalhos"], [data-tour="cabecalho-modulo"]';

/** Barra de atalhos do celular visível: o balão não pode cobri-la. */
function reservaInferior(): number {
  const barra = document.querySelector<HTMLElement>('nav[aria-label="Atalhos"]');
  if (!barra) return 0;
  const caixa = barra.getBoundingClientRect();
  if (caixa.height === 0 || getComputedStyle(barra).display === "none") return 0;
  return Math.max(0, window.innerHeight - caixa.top);
}

/** Traz o alvo para a área livre, abaixo do cabeçalho preso do módulo. */
function trazerParaATela(alvo: HTMLElement) {
  if (alvo.closest(FIXOS)) return;
  const caixa = alvo.getBoundingClientRect();
  const topoLivre = document.querySelector('[data-tour="cabecalho-modulo"]')?.getBoundingClientRect().bottom ?? 0;
  const baseLivre = window.innerHeight - reservaInferior();
  if (caixa.top >= topoLivre + 8 && caixa.bottom <= baseLivre - 8) return;
  const alturaLivre = baseLivre - topoLivre;
  // Alvo alto (lista, formulário): começo dele logo abaixo do cabeçalho; senão, no meio.
  const deslocamento =
    caixa.height > alturaLivre * 0.6
      ? caixa.top - topoLivre - 12
      : caixa.top - topoLivre - (alturaLivre - caixa.height) / 2;
  window.scrollTo({ top: window.scrollY + deslocamento, behavior: "auto" });
}

type Medidas = { destaque: { top: number; left: number; width: number; height: number }; balao: PosicaoBalaoTour };

function BalaoTour({
  passos,
  indice,
  aoProximo,
  aoFechar,
}: {
  passos: PassoTour[];
  indice: number;
  aoProximo: () => void;
  aoFechar: () => void;
}) {
  const passo = passos[indice];
  const ultimo = ehUltimoPasso(indice, passos.length);
  const balaoRef = useRef<HTMLDivElement>(null);
  const proximoRef = useRef<HTMLButtonElement>(null);
  const alvoRef = useRef<HTMLElement | null>(null);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const idTitulo = useId();
  const idTexto = useId();
  const aoProximoRef = useRef(aoProximo);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoProximoRef.current = aoProximo;
    aoFecharRef.current = aoFechar;
  });

  const medir = useCallback(() => {
    const alvo = alvoRef.current;
    const balao = balaoRef.current;
    if (!alvo || !balao) return;
    const caixa = alvo.getBoundingClientRect();
    const reserva = reservaInferior();
    const tela = { largura: window.innerWidth, altura: window.innerHeight, reservaInferior: reserva };
    // Destaque só na parte do alvo que está na tela.
    const topo = Math.max(caixa.top, 0);
    const base = Math.min(caixa.bottom, window.innerHeight);
    setMedidas({
      destaque: { top: topo - 4, left: caixa.left - 4, width: caixa.width + 8, height: Math.max(0, base - topo) + 8 },
      balao: posicionarBalaoTour(
        { top: topo, bottom: base, left: caixa.left, right: caixa.right },
        { largura: balao.offsetWidth, altura: balao.offsetHeight },
        tela,
      ),
    });
  }, []);

  // Acha o alvo do passo; se sumiu desde o início do tour, pula para o próximo.
  useLayoutEffect(() => {
    const alvo = acharAlvo(passo.alvos);
    if (!alvo) {
      aoProximoRef.current();
      return;
    }
    alvoRef.current = alvo;
    trazerParaATela(alvo);
    medir();
  }, [passo, medir]);

  useEffect(() => {
    let quadro = 0;
    function remedir() {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    }
    window.addEventListener("resize", remedir);
    window.addEventListener("scroll", remedir, true);
    window.visualViewport?.addEventListener("resize", remedir);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", remedir);
      window.removeEventListener("scroll", remedir, true);
      window.visualViewport?.removeEventListener("resize", remedir);
    };
  }, [medir]);

  // Foco no botão principal a cada passo, depois de medido (antes o balão está
  // invisível e não recebe foco); ao fechar, volta para onde estava.
  const medido = medidas !== null;
  useEffect(() => {
    if (medido) proximoRef.current?.focus({ preventScroll: true });
  }, [indice, medido]);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    return () => {
      if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
    };
  }, []);

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      aoFechar();
      return;
    }
    if (evento.key !== "Tab") return;
    // Foco preso no balão (só os botões dele).
    const botoes = Array.from(balaoRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
    if (botoes.length === 0) return;
    const primeiro = botoes[0];
    const ultimoBotao = botoes[botoes.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimoBotao.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimoBotao) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  // Esc também fecha com o foco fora do balão (ex.: clique no fundo).
  useEffect(() => {
    function aoTeclarDocumento(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFecharRef.current();
    }
    document.addEventListener("keydown", aoTeclarDocumento);
    return () => document.removeEventListener("keydown", aoTeclarDocumento);
  }, []);

  return (
    <>
      {/* Fundo: segura o clique na página enquanto o tour está aberto. */}
      <div aria-hidden="true" className="fixed inset-0 z-[80]" onClick={() => proximoRef.current?.focus()} />
      {medidas && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[81] rounded-xl border-2 border-ambar shadow-[0_0_0_9999px_rgba(13,31,45,0.55)] transition-all duration-200"
          style={medidas.destaque}
        />
      )}
      <div
        ref={balaoRef}
        role="dialog"
        aria-modal="true"
        // Clique no texto do balão não tira o foco de dentro dele.
        tabIndex={-1}
        aria-labelledby={idTitulo}
        aria-describedby={idTexto}
        onKeyDown={aoTeclar}
        style={{
          top: medidas?.balao.top ?? 0,
          left: medidas?.balao.left ?? 0,
          // Antes de medir fica invisível, para não piscar no canto.
          visibility: medidas ? "visible" : "hidden",
        }}
        className="fixed z-[82] w-[min(22rem,calc(100vw-24px))] rounded-2xl border border-cinza-claro bg-branco p-4 text-azul-noite shadow-xl"
      >
        <div className="flex items-start gap-2">
          <p id={idTitulo} className="min-w-0 flex-1 text-[15px] font-bold leading-snug">
            {passo.titulo}
          </p>
          <span className="shrink-0 rounded-full bg-ambar/15 px-2 py-0.5 text-[11px] font-semibold text-azul-noite">
            {textoContador(indice, passos.length)}
          </span>
        </div>
        <p id={idTexto} className="mt-1.5 text-sm leading-relaxed text-cinza">
          {passo.texto}
        </p>
        <div className="mt-3.5 flex items-center justify-end gap-2">
          {!ultimo && (
            <button
              type="button"
              onClick={aoFechar}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-cinza-medio transition-colors hover:bg-off-white hover:text-azul-noite focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
            >
              Pular
            </button>
          )}
          <button
            ref={proximoRef}
            type="button"
            onClick={aoProximo}
            className="min-h-10 rounded-lg bg-azul-noite px-4 text-sm font-semibold text-branco transition-colors hover:bg-azul-petroleo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar focus-visible:ring-offset-2"
          >
            {ultimo ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </>
  );
}

/** Botão "Rever o tour" do cabeçalho do módulo (alvo do último passo). */
export function BotaoReverTour() {
  const rever = useReverTour();
  if (!rever) return null;
  return (
    <button
      type="button"
      data-tour="rever-tour"
      onClick={rever}
      aria-label="Rever o tour deste módulo"
      title="Rever o tour deste módulo"
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-cinza-claro bg-branco text-azul-noite transition-colors hover:border-ambar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
    >
      <IconeNavegacao nome="ajuda" className="h-[18px] w-[18px]" />
    </button>
  );
}
