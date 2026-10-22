/** Apoio comum do GuardaContagem e do GuardaEdicao para o botão "voltar" do
 * navegador (gesto de dois dedos no trackpad do Mac, botão do mouse, Alt+←).
 *
 * Ao ativar o aviso, empurramos uma entrada extra no histórico, na mesma URL.
 * Quando a pessoa volta, o navegador sai só dessa entrada extra (a página não
 * muda) e o `popstate` avisa a guarda, que mostra o mesmo aviso do clique em
 * link. O `pushState` sem URL é integrado ao roteador do Next (ele copia o
 * estado interno para a nova entrada), então nada é recarregado.
 *
 * A marca em `history.state` sozinha não basta: o Next regrava o estado da
 * entrada atual (`replaceState`) depois de server action com `revalidatePath`
 * e de `router.refresh()`, e a marca some. Como Contagem e Edição reativam a
 * guarda a cada salvar, cada ciclo empurraria OUTRA entrada e o "Sair" do
 * aviso (`history.back()`) cairia na mesma página. Por isso o controle de
 * verdade fica aqui no módulo: no máximo uma entrada extra por página.
 *
 * Limitação conhecida: `desativar()` não remove a entrada extra. Depois de
 * salvar/enviar, o primeiro "voltar" sai só dela (a tela não muda) e o
 * segundo volta de fato. Nenhum dado se perde. */
const MARCA = "__guardaZattiHub";

let entradaExtraAtiva = false;
/** pathname + search da página em que a entrada extra foi empurrada. */
let paginaGuardada: string | null = null;
/** hash da página guardada, para reconhecer popstate de fragmento. */
let hashGuardado = "";

function paginaAtual(): string {
  return window.location.pathname + window.location.search;
}

export function historicoTemMarca(): boolean {
  const estado = window.history.state as Record<string, unknown> | null;
  return Boolean(estado && estado[MARCA]);
}

/** Empurra a entrada extra, uma vez só por página (chamar várias vezes não
 * empilha, nem depois de o Next apagar a marca do `history.state`). Em outra
 * página (navegação no cliente), a página nova ganha a sua. */
export function empurrarMarcaHistorico(): void {
  if (entradaExtraAtiva && paginaGuardada === paginaAtual()) return;
  if (historicoTemMarca()) {
    entradaExtraAtiva = true;
  } else {
    window.history.pushState({ [MARCA]: true }, "");
    entradaExtraAtiva = true;
  }
  paginaGuardada = paginaAtual();
  hashGuardado = window.location.hash;
}

/** A pessoa saiu da entrada extra (voltar): a próxima ativação pode empurrar
 * outra. Chamar no `popstate` reconhecido e no "Sair" do aviso de voltar. */
export function registrarSaidaDaEntradaExtra(): void {
  entradaExtraAtiva = false;
}

/** O `popstate` é o "voltar" que sai da entrada extra desta página? Não é
 * quando não há entrada extra, quando a URL já é de outra página (o Next
 * cuida da navegação) ou quando só o fragmento mudou (ex. o link "Pular
 * para o conteúdo", `#conteudo-principal`, também dispara `popstate`). */
export function ehVoltaDaEntradaExtra(): boolean {
  if (!entradaExtraAtiva) return false;
  if (paginaAtual() !== paginaGuardada) return false;
  if (window.location.hash !== hashGuardado) return false;
  return true;
}

/** Só para testes: zera o estado do módulo. */
export function _reiniciarGuardaHistoricoParaTeste(): void {
  entradaExtraAtiva = false;
  paginaGuardada = null;
  hashGuardado = "";
}

/** Clique que o navegador abre em outra aba/janela (Cmd/Ctrl/Shift+clique,
 * botão do meio, link com target) não tira a pessoa da tela: sem aviso. */
export function cliqueAbreOutraAba(e: MouseEvent, link: HTMLAnchorElement): boolean {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true;
  if (e.button !== 0) return true;
  const alvo = link.getAttribute("target");
  return Boolean(alvo && alvo !== "_self");
}
