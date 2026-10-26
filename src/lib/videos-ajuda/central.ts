// Central de Vídeos explicativos (`/ajuda/videos`, 26/10/2026). Agrupa o que
// estiver em `VIDEOS_AJUDA` por seção do app: vídeo novo entra sozinho na
// central; se o id não estiver no mapa abaixo, cai em "Outros vídeos".

export type SecaoVideos = "Começo" | "Estoque" | "Outros vídeos";

const ORDEM_SECOES: readonly SecaoVideos[] = ["Começo", "Estoque", "Outros vídeos"];

const SECAO_DO_VIDEO: Readonly<Record<string, SecaoVideos>> = {
  "boas-vindas": "Começo",
  "instalar-iphone": "Começo",
  "instalar-android": "Começo",
  contagem: "Estoque",
  cotacao: "Estoque",
  espelhos: "Estoque",
  "pedido-feito": "Estoque",
};

export function secaoDoVideo(id: string): SecaoVideos {
  return SECAO_DO_VIDEO[id] ?? "Outros vídeos";
}

/** Seções na ordem fixa, vídeos na ordem de `VIDEOS_AJUDA`; seção vazia não aparece. */
export function agruparVideosPorSecao<Id extends string, V>(
  videos: Readonly<Record<Id, V>>,
): { secao: SecaoVideos; videos: { id: Id; video: V }[] }[] {
  const entradas = Object.entries(videos) as [Id, V][];
  return ORDEM_SECOES.map((secao) => ({
    secao,
    videos: entradas.filter(([id]) => secaoDoVideo(id) === secao).map(([id, video]) => ({ id, video })),
  })).filter((grupo) => grupo.videos.length > 0);
}

/** Vídeo horizontal (capa mais larga que alta) ganha o selo "Melhor com o celular deitado". */
export function ehVideoDeitado(largura: number, altura: number): boolean {
  return largura > 0 && altura > 0 && largura > altura;
}
