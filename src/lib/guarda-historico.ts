/** Apoio comum do GuardaContagem e do GuardaEdicao para o botão "voltar" do
 * navegador (gesto de dois dedos no trackpad do Mac, botão do mouse, Alt+←).
 *
 * Ao ativar o aviso, empurramos uma entrada extra no histórico, na mesma URL.
 * Quando a pessoa volta, o navegador sai só dessa entrada extra (a página não
 * muda) e o `popstate` avisa a guarda, que mostra o mesmo aviso do clique em
 * link. O `pushState` sem URL é integrado ao roteador do Next (ele copia o
 * estado interno para a nova entrada), então nada é recarregado. */
const MARCA = "__guardaZattiHub";

export function historicoTemMarca(): boolean {
  const estado = window.history.state as Record<string, unknown> | null;
  return Boolean(estado && estado[MARCA]);
}

/** Empurra a entrada extra, uma vez só (chamar várias vezes não empilha). */
export function empurrarMarcaHistorico(): void {
  if (historicoTemMarca()) return;
  window.history.pushState({ [MARCA]: true }, "");
}

/** Clique que o navegador abre em outra aba/janela (Cmd/Ctrl/Shift+clique,
 * botão do meio, link com target) não tira a pessoa da tela: sem aviso. */
export function cliqueAbreOutraAba(e: MouseEvent, link: HTMLAnchorElement): boolean {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;
  if (e.button !== 0) return true;
  const alvo = link.getAttribute("target");
  return Boolean(alvo && alvo !== "_self");
}
