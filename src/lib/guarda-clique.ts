/** Apoio comum do GuardaContagem e do GuardaEdicao: clique que o navegador
 * abre em outra aba/janela (Cmd/Ctrl/Shift/Alt+clique, botão do meio, link
 * com target) não tira a pessoa da tela, então não mostra o aviso.
 *
 * O botão "voltar" do navegador (e o gesto do trackpad no Mac) NÃO é
 * interceptado: a tentativa de 22/10 com entrada extra no histórico foi
 * vetada na revisão (o roteador do Next restaura a rota no popstate mesmo
 * com o aviso aberto). Fica para uma entrega própria. */
export function cliqueAbreOutraAba(
  e: Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "button">,
  link: Pick<HTMLAnchorElement, "getAttribute">,
): boolean {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;
  if (e.button !== 0) return true;
  const alvo = link.getAttribute("target");
  return Boolean(alvo && alvo !== "_self");
}
