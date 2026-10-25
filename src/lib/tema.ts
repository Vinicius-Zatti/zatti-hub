// Tema escuro (Navegação V2, fase 7, 25/10/2026) - só na unidade piloto.
// A preferência fica neste aparelho (localStorage), separada por usuário: um
// tablet compartilhado no restaurante não leva o tema de uma pessoa para outra.
// O script do <head> (`SCRIPT_TEMA_INICIAL`) aplica o último tema usado antes
// da pintura, para a tela não piscar clara; o alternador do menu confere a
// preferência de quem está logado ao montar. As cores do tema escuro só valem
// com o shell da Navegação V2 na tela (`[data-tema-piloto]`, ver globals.css).

export type PreferenciaTema = "claro" | "escuro" | "automatico";
export type TemaAplicado = "claro" | "escuro";

/** Sem escolha salva, o piloto continua claro: ninguém muda de tema sem pedir. */
export const PREFERENCIA_PADRAO: PreferenciaTema = "claro";

/** Último tema usado neste aparelho: é o que o script do <head> lê. */
export const CHAVE_TEMA_ATUAL = "zatti-hub:tema";

export const OPCOES_TEMA: { valor: PreferenciaTema; rotulo: string; dica: string }[] = [
  { valor: "claro", rotulo: "Claro", dica: "Tema claro" },
  { valor: "escuro", rotulo: "Escuro", dica: "Tema escuro" },
  { valor: "automatico", rotulo: "Auto", dica: "Automático: segue o tema do aparelho" },
];

export function lerPreferencia(valor: string | null | undefined): PreferenciaTema | null {
  return valor === "claro" || valor === "escuro" || valor === "automatico" ? valor : null;
}

export function resolverTema(preferencia: PreferenciaTema, sistemaEscuro: boolean): TemaAplicado {
  if (preferencia === "automatico") return sistemaEscuro ? "escuro" : "claro";
  return preferencia;
}

/** Chave por usuário sem guardar o e-mail em texto puro no aparelho. */
export function chavePreferenciaUsuario(usuario: string): string {
  let hash = 5381;
  const texto = usuario.trim().toLowerCase();
  for (let i = 0; i < texto.length; i++) hash = ((hash << 5) + hash + texto.charCodeAt(i)) >>> 0;
  return `${CHAVE_TEMA_ATUAL}:${hash.toString(36)}`;
}

/** Roda no <head>, antes da pintura. Falha de localStorage (aba anônima,
 * dado bloqueado) cai no tema claro. Mantido em ES5 e sem dependências. */
export const SCRIPT_TEMA_INICIAL = `(function(){var d=document.documentElement;try{var p=localStorage.getItem("${CHAVE_TEMA_ATUAL}");if(p!=="claro"&&p!=="escuro"&&p!=="automatico")p="${PREFERENCIA_PADRAO}";var e=p==="escuro"||(p==="automatico"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.setAttribute("data-tema",e?"escuro":"claro");}catch(_){d.setAttribute("data-tema","claro");}})();`;
