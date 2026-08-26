"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export type ColunaDre = { id: string; rotulo: string };

const CHAVE_LOCALSTORAGE = "zatti-hub:financeiro-gerencial:dre:colunas-visiveis";

function lerColunasSalvas(idsValidos: string[]): Set<string> | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return null;
    const lista = JSON.parse(bruto) as unknown;
    if (!Array.isArray(lista)) return null;
    const validas = lista.filter((id): id is string => typeof id === "string" && idsValidos.includes(id));
    return validas.length > 0 ? new Set(validas) : null;
  } catch {
    return null;
  }
}

// `localStorage` é uma fonte externa ao React (e só existe no navegador) -
// ler o valor salvo pra sincronizar o estado inicial é exatamente o caso de
// uso do `useSyncExternalStore` (server snapshot = todas visíveis, sem
// hidratação divergente; client snapshot = o que a pessoa salvou, cacheado
// por referência estável até a próxima escrita). Evita tanto o aviso de
// hidratação quanto o setState direto dentro de efeito.
const ouvintes = new Set<() => void>();
let colunasCacheadas: Set<string> | null = null;

function obterInstantaneoCliente(idsValidos: string[]): Set<string> {
  if (colunasCacheadas === null) colunasCacheadas = lerColunasSalvas(idsValidos) ?? new Set(idsValidos);
  return colunasCacheadas;
}

function obterInstantaneoServidor(idsValidos: string[]): Set<string> {
  return new Set(idsValidos);
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function definirColunas(colunas: Set<string>) {
  colunasCacheadas = colunas;
  try {
    window.localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(Array.from(colunas)));
  } catch {
    // localStorage indisponível (modo privado, navegador antigo etc.) -
    // preferência simplesmente não persiste, resto da tela funciona normal.
  }
  ouvintes.forEach((notificar) => notificar());
}

/** Quais colunas numéricas (Média/Total/meses) da DRE ficam visíveis - só
 * muda a visualização, nunca o cálculo (os totais continuam somando os 12
 * meses reais por trás). Preferência salva no navegador da pessoa (nunca
 * sincronizada entre dispositivos/pessoas). Nunca some a última coluna
 * visível. */
export function useColunasVisiveis(colunas: ColunaDre[]) {
  const idsValidos = colunas.map((c) => c.id);
  const visiveis = useSyncExternalStore(
    inscrever,
    () => obterInstantaneoCliente(idsValidos),
    () => obterInstantaneoServidor(idsValidos),
  );

  function alternar(id: string) {
    if (visiveis.has(id) && visiveis.size === 1) return; // nunca zero colunas visíveis
    const proximo = new Set(visiveis);
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    definirColunas(proximo);
  }

  function mostrarTodas() {
    definirColunas(new Set(idsValidos));
  }

  return { visiveis, alternar, mostrarTodas };
}

function IconeColunas() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  );
}

/** Botão "Colunas" + menu de checkboxes. Mesmo padrão de dropdown já usado
 * em `CodigoSelect` (portal pro `document.body`, reposiciona no scroll/resize,
 * fecha ao clicar fora) - necessário porque a tabela rola dentro de
 * `TabelaRolavel` (`overflow-auto`), que cortaria um dropdown posicionado
 * normalmente. */
export function BotaoColunasDre({
  colunas,
  visiveis,
  onAlternar,
  onMostrarTodas,
}: {
  colunas: ColunaDre[];
  visiveis: Set<string>;
  onAlternar: (id: string) => void;
  onMostrarTodas: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function reposicionar() {
    const rect = botaoRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosicao({ top: rect.bottom + 4, left: Math.max(8, rect.right - 224) });
  }

  useLayoutEffect(() => {
    if (aberto) reposicionar();
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (botaoRef.current?.contains(alvo)) return;
      if (menuRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    function aoRolarOuRedimensionar() {
      reposicionar();
    }
    document.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("scroll", aoRolarOuRedimensionar, true);
    window.addEventListener("resize", aoRolarOuRedimensionar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("scroll", aoRolarOuRedimensionar, true);
      window.removeEventListener("resize", aoRolarOuRedimensionar);
    };
  }, [aberto]);

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-1.5 rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-xs font-semibold text-cinza-medio hover:border-ambar hover:text-azul-petroleo"
      >
        <IconeColunas />
        Colunas
      </button>
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: posicao.top, left: posicao.left }}
            className="z-50 w-56 rounded-md border border-cinza-claro bg-branco shadow-lg"
          >
            <div className="max-h-72 overflow-y-auto p-2">
              {colunas.map((coluna) => {
                const marcada = visiveis.has(coluna.id);
                const ultimaVisivel = marcada && visiveis.size === 1;
                return (
                  <label
                    key={coluna.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                      ultimaVisivel ? "cursor-not-allowed text-cinza-medio" : "cursor-pointer text-cinza hover:bg-off-white"
                    }`}
                  >
                    <input type="checkbox" checked={marcada} disabled={ultimaVisivel} onChange={() => onAlternar(coluna.id)} className="h-3.5 w-3.5" />
                    {coluna.rotulo}
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onMostrarTodas}
              className="block w-full whitespace-nowrap border-t border-cinza-claro px-3 py-1.5 text-left text-xs font-semibold text-ambar hover:bg-ambar/10"
            >
              Mostrar todas
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
