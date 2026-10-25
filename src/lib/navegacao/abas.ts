import { moduloAtivo, subitemAtivo, type ItemNavegacao } from "./tipos";

// Navegação V2 (24/10/2026): cabeçalho de módulo e abas do piloto. Uma fonte
// só: as abas de cada módulo saem das seções e subitens que o menu do piloto
// já mostra para a pessoa (`montarMenuRestaurantePiloto`), então papel e flags
// valem igual no menu, na barra inferior e nas abas.

export type AbaModulo = { label: string; href: string };

export type CabecalhoModulo = {
  /** Nome do módulo (subtítulo nas telas internas). */
  modulo: string;
  /** Página de entrada do módulo: destino da seta de voltar. */
  entrada: string;
  /** Nível 1: as seções do módulo, cada uma abrindo na primeira tela dela.
   * Módulo de uma seção só lista as telas direto (sem nível 2). Vazio =
   * módulo de uma tela só. */
  abas: AbaModulo[];
  /** Href da aba de nível 1 acesa. */
  abaAtiva: string | undefined;
  /** Nível 2: as telas da seção atual, só quando ela tem mais de uma. */
  subAbas: AbaModulo[];
  /** Href da tela acesa no nível 2. */
  subAbaAtiva: string | undefined;
  /** Na própria página de entrada não há seta de voltar. */
  naEntrada: boolean;
  titulo: string;
};

/** Módulos sem cabeçalho. O Início saiu daqui na fase 3 (24/10/2026): com as
 * abas Início | Dashboard da gestão e a lupa da busca no celular, ele usa o
 * mesmo cabeçalho dos outros módulos. */
const SEM_CABECALHO = new Set<string>();

/**
 * Abas em dois níveis (pedido de Vinícius, 24/10/2026: uma aba por tela
 * deixava Estoque com ~9 e Financeiro com ~11). Nível 1 = seções do menu, na
 * ordem do menu; nível 2 = telas da seção atual, só quando ela tem mais de uma.
 * Módulo com uma seção só (Vendas, Cardápio, Relatórios) mostra as telas no
 * nível 1, como antes: uma aba única com o nome da seção não diria nada.
 */
export function cabecalhoDoModulo(items: ItemNavegacao[], pathname: string): CabecalhoModulo | null {
  const label = moduloAtivo(items, pathname);
  const modulo = items.find((item) => item.label === label && !item.disabled);
  if (!modulo || SEM_CABECALHO.has(modulo.label)) return null;

  const secoes = (modulo.sections ?? []).filter((secao) => secao.items.length > 0);
  const telas = secoes.flatMap((secao) => secao.items.map(({ label, href }) => ({ label, href })));
  const telaAtiva = telas.length > 0 ? subitemAtivo([modulo], pathname) : undefined;
  const naEntrada = pathname === modulo.href;
  const tituloTela = telas.find((tela) => tela.href === telaAtiva)?.label;
  const titulo = naEntrada || !tituloTela ? modulo.label : tituloTela;
  const base = { modulo: modulo.label, entrada: modulo.href, naEntrada, titulo };

  if (secoes.length <= 1) {
    return { ...base, abas: telas, abaAtiva: telaAtiva, subAbas: [], subAbaAtiva: undefined };
  }

  const secaoAtual = secoes.find((secao) => secao.items.some((item) => item.href === telaAtiva));
  const comVarias = secaoAtual && secaoAtual.items.length > 1;
  return {
    ...base,
    abas: secoes.map((secao) => ({ label: secao.label, href: secao.items[0].href })),
    abaAtiva: secaoAtual?.items[0].href,
    subAbas: comVarias ? secaoAtual.items.map(({ label, href }) => ({ label, href })) : [],
    subAbaAtiva: comVarias ? telaAtiva : undefined,
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
