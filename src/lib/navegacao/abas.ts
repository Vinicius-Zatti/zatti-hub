import { moduloAtivo, subitemAtivo, type ItemNavegacao } from "./tipos";

// Navegação V2 (24/10/2026): cabeçalho de módulo e abas do piloto. Uma fonte
// só: as abas de cada módulo são os subitens que o menu do piloto já mostra
// para a pessoa (`montarMenuRestaurantePiloto`), então papel e flags valem
// igual no menu, na barra inferior e nas abas.

export type AbaModulo = { label: string; href: string };

export type CabecalhoModulo = {
  /** Nome do módulo (subtítulo nas telas internas). */
  modulo: string;
  /** Página de entrada do módulo: destino da seta de voltar. */
  entrada: string;
  /** Telas irmãs do módulo, na ordem do menu (vazio = módulo de uma tela só). */
  abas: AbaModulo[];
  abaAtiva: string | undefined;
  /** Na própria página de entrada não há seta de voltar. */
  naEntrada: boolean;
  titulo: string;
};

/** Módulos sem cabeçalho: o Início já abre com a saudação dele. */
const SEM_CABECALHO = new Set(["Início"]);

export function cabecalhoDoModulo(items: ItemNavegacao[], pathname: string): CabecalhoModulo | null {
  const label = moduloAtivo(items, pathname);
  const modulo = items.find((item) => item.label === label && !item.disabled);
  if (!modulo || SEM_CABECALHO.has(modulo.label)) return null;

  const abas = (modulo.sections ?? []).flatMap((secao) => secao.items.map(({ label, href }) => ({ label, href })));
  const abaAtiva = abas.length > 0 ? subitemAtivo([modulo], pathname) : undefined;
  const naEntrada = pathname === modulo.href;
  const tituloAba = abas.find((aba) => aba.href === abaAtiva)?.label;
  return {
    modulo: modulo.label,
    entrada: modulo.href,
    abas,
    abaAtiva,
    naEntrada,
    titulo: naEntrada || !tituloAba ? modulo.label : tituloAba,
  };
}

// As 3 telas de Pedidos operam sobre a MESMA contagem base (`?data=`): trocar
// de aba sem levar o parâmetro abria outra data e parecia que "não salvou"
// (histórico completo em `estoque/pedidos/pedidos-sub-tabs.tsx`).
export const HREFS_COM_CONTAGEM_BASE: ReadonlySet<string> = new Set([
  "/estoque/pedidos",
  "/estoque/pedidos/cotacoes",
  "/estoque/pedidos/feitos",
]);

/** Leva o `?data=` da tela atual para as abas de Pedidos. */
export function comContagemBase<T extends { href: string }>(abas: T[], data: string | null): T[] {
  if (!data) return abas;
  return abas.map((aba) =>
    HREFS_COM_CONTAGEM_BASE.has(aba.href) ? { ...aba, href: `${aba.href}?data=${encodeURIComponent(data)}` } : aba,
  );
}
