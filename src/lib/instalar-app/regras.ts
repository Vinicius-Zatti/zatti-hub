// Convite para instalar o Zatti Hub como app no celular (26/10/2026).
// Regras puras de quando mostrar e qual caminho ensinar; o cartão fica em
// `components/convite-instalar-app.tsx`. Aparece só no celular ou tablet
// (iPhone, iPad, Android), só fora do app instalado e nunca no computador.
// "Agora não" esconde por 7 dias; instalado, nunca mais.

export type Plataforma = "ios" | "android" | "computador";

/** Caminho que o cartão ensina: botão nativo do Chrome ou passos com vídeo. */
export type ModoConvite = "botao-nativo" | "passos-android" | "passos-ios";

export const DIAS_ESPERA_RECUSA = 7;
const MS_DIA = 24 * 60 * 60 * 1000;

/** Chaves no localStorage deste aparelho. */
export const CHAVE_RECUSA = "zatti-hub:instalar-app:recusado-em";
export const CHAVE_INSTALADO = "zatti-hub:instalar-app:instalado";

/** Evento global disparado pelo script do <head> quando o Chrome libera a instalação. */
export const EVENTO_PROMPT_PRONTO = "zatti-hub:instalar-app-pronto";

/** iPadOS 13+ se apresenta como Mac: o que denuncia é a tela de toque. */
export function detectarPlataforma(userAgent: string, toquesMaximos: number): Plataforma {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Macintosh/i.test(userAgent) && toquesMaximos > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "computador";
}

/** Valor gravado em "Agora não" (milissegundos); qualquer outra coisa vale como não recusado. */
export function lerRecusa(valor: string | null | undefined): number | null {
  if (!valor || !/^\d{1,15}$/.test(valor)) return null;
  return Number(valor);
}

export function deveMostrarConvite(estado: {
  plataforma: Plataforma;
  /** Rodando como app instalado (display-mode standalone ou navigator.standalone). */
  standalone: boolean;
  instalado: boolean;
  recusadoEm: number | null;
  agora: number;
}): boolean {
  if (estado.plataforma === "computador") return false;
  if (estado.standalone || estado.instalado) return false;
  if (estado.recusadoEm !== null) {
    const passou = estado.agora - estado.recusadoEm;
    // Relógio do aparelho voltou no tempo: conta como recusado agora.
    if (passou < DIAS_ESPERA_RECUSA * MS_DIA) return false;
  }
  return true;
}

export function modoConvite(plataforma: Plataforma, temPromptNativo: boolean): ModoConvite {
  if (plataforma === "ios") return "passos-ios";
  return temPromptNativo ? "botao-nativo" : "passos-android";
}

/** Script do <head>: guarda o pedido de instalação do Chrome antes da hidratação
 * (ele pode chegar antes de o cartão montar) e marca o app instalado. */
export const SCRIPT_CAPTURA_INSTALACAO = `(function(){try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__zattiPromptInstalar=e;window.dispatchEvent(new Event("${EVENTO_PROMPT_PRONTO}"));});window.addEventListener("appinstalled",function(){window.__zattiPromptInstalar=null;try{localStorage.setItem("${CHAVE_INSTALADO}","1");}catch(_){}window.dispatchEvent(new Event("${EVENTO_PROMPT_PRONTO}"));});}catch(_){}})();`;
