// Vídeos explicativos dentro do app (26/10/2026). Regras puras de quando
// oferecer o vídeo de boas-vindas e da ordem dos avisos do primeiro acesso;
// a tela fica em `components/videos-ajuda.tsx`. Mesmo padrão do convite de
// instalar o app (PR #56): arquivos em `public/videos/` (h264, faststart, capa
// jpg), `preload="none"` e nunca tocam sozinhos.

export type IdVideoAjuda = "boas-vindas" | "contagem";

export type VideoAjuda = { titulo: string; src: string; capa: string; duracao: string };

export const VIDEOS_AJUDA: Readonly<Record<IdVideoAjuda, VideoAjuda>> = {
  "boas-vindas": {
    titulo: "Boas-vindas ao Zatti Hub",
    src: "/videos/zatti-hub-boas-vindas.mp4",
    capa: "/videos/zatti-hub-boas-vindas-capa.jpg",
    duracao: "2 min",
  },
  contagem: {
    titulo: "Como fazer a contagem de estoque",
    src: "/videos/zatti-hub-contagem-de-estoque.mp4",
    capa: "/videos/zatti-hub-contagem-de-estoque-capa.jpg",
    duracao: "2 min",
  },
};

/** Gravado em `tours_vistos` (mesma tabela do tour, por usuário) quando o
 * cartão de boas-vindas aparece: ele é oferecido uma vez só, em qualquer aparelho. */
export const CHAVE_VIDEO_BOAS_VINDAS = "video_boas_vindas";

/**
 * Oferece o vídeo uma vez por usuário. `vistos === null` (leitura do banco
 * falhou, ex.: migration do tour ausente): na dúvida não oferece, para não
 * reaparecer a cada tela.
 */
export function deveOferecerBoasVindas(vistos: ReadonlySet<string> | null): boolean {
  if (vistos === null) return false;
  return !vistos.has(CHAVE_VIDEO_BOAS_VINDAS);
}

export type AvisoPrimeiroAcesso = "tour" | "boas-vindas" | "instalar";

/**
 * Um aviso de cada vez, nesta ordem: tour do módulo, cartão de boas-vindas,
 * convite de instalar o app. Devolve qual pode aparecer agora (null = nenhum).
 * Um aviso ainda pendente segura os seguintes, mesmo que não esteja na tela
 * (ex.: tela em modo foco), para não pular a fila.
 */
export function proximoAvisoPrimeiroAcesso(estado: {
  /** Tour aberto ou ainda por abrir sozinho neste módulo. */
  tourPendente: boolean;
  /** Cartão de boas-vindas aberto ou ainda por oferecer. */
  boasVindasPendente: boolean;
  /** Convite de instalar elegível (celular, fora do app, sem recusa recente). */
  conviteElegivel: boolean;
}): AvisoPrimeiroAcesso | null {
  if (estado.tourPendente) return "tour";
  if (estado.boasVindasPendente) return "boas-vindas";
  if (estado.conviteElegivel) return "instalar";
  return null;
}
