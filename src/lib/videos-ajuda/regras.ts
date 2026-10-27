// Vídeos explicativos dentro do app (26/10/2026). Regras puras de quando
// oferecer o vídeo de boas-vindas e da ordem dos avisos do primeiro acesso;
// a tela fica em `components/videos-ajuda.tsx`. Mesmo padrão do convite de
// instalar o app (PR #56): arquivos em `public/videos/` (h264, faststart, capa
// jpg), `preload="none"` e nunca tocam sozinhos.

export type IdVideoAjuda =
  | "boas-vindas"
  | "instalar-iphone"
  | "instalar-android"
  | "contagem"
  | "cotacao"
  | "espelhos"
  | "pedido-feito"
  | "estoque-visao-geral"
  | "estoque-produtos"
  | "estoque-editar-produtos"
  | "estoque-setores"
  | "estoque-conferir-contagens"
  | "estoque-fornecedores"
  | "estoque-editar-fornecedores"
  | "estoque-cmv-real"
  | "estoque-perdas"
  | "estoque-movimentacoes"
  | "garante-hoje"
  | "garante-planos"
  | "garante-quadro"
  | "garante-nota"
  | "garante-modelos";

export type VideoAjuda = {
  titulo: string;
  src: string;
  capa: string;
  duracao: string;
  /** Tamanho do quadro do vídeo: o player tira daí a proporção, sem cortar nem
   * deformar. Os verticais (768x1664) cabem na caixa estreita; os horizontais
   * (1664x768, telas de tabela larga) abrem na caixa larga. */
  largura: number;
  altura: number;
};

export const VIDEOS_AJUDA: Readonly<Record<IdVideoAjuda, VideoAjuda>> = {
  "boas-vindas": {
    titulo: "Boas-vindas ao Zatti Hub",
    src: "/videos/zatti-hub-boas-vindas.mp4",
    capa: "/videos/zatti-hub-boas-vindas-capa.jpg",
    duracao: "2 min",
    largura: 768,
    altura: 1664,
  },
  // Os mesmos do convite de instalar (`convite-instalar-app.tsx`), para a
  // central de Vídeos explicativos (`/ajuda/videos`).
  "instalar-iphone": {
    titulo: "Como instalar o app no iPhone",
    src: "/videos/zatti-hub-como-app-no-celular-iphone.mp4",
    capa: "/videos/zatti-hub-como-app-no-celular-iphone-capa.jpg",
    duracao: "42s",
    largura: 768,
    altura: 1664,
  },
  "instalar-android": {
    titulo: "Como instalar o app no Android",
    src: "/videos/zatti-hub-como-app-no-celular-android.mp4",
    capa: "/videos/zatti-hub-como-app-no-celular-android-capa.jpg",
    duracao: "43s",
    largura: 768,
    altura: 1664,
  },
  contagem: {
    titulo: "Como fazer a contagem de estoque",
    src: "/videos/zatti-hub-contagem-de-estoque.mp4",
    capa: "/videos/zatti-hub-contagem-de-estoque-capa.jpg",
    duracao: "2 min",
    largura: 768,
    altura: 1664,
  },
  cotacao: {
    titulo: "Como fazer a cotação",
    src: "/videos/zatti-hub-criar-cotacao.mp4",
    capa: "/videos/zatti-hub-criar-cotacao-capa.jpg",
    duracao: "2 min",
    largura: 1664,
    altura: 768,
  },
  espelhos: {
    titulo: "Como usar o Editor de espelhos",
    src: "/videos/zatti-hub-editor-de-espelhos.mp4",
    capa: "/videos/zatti-hub-editor-de-espelhos-capa.jpg",
    duracao: "2 min",
    largura: 1664,
    altura: 768,
  },
  "pedido-feito": {
    titulo: "Como receber o pedido",
    src: "/videos/zatti-hub-pedido-feito-recebimento.mp4",
    capa: "/videos/zatti-hub-pedido-feito-recebimento-capa.jpg",
    duracao: "1 min",
    largura: 1664,
    altura: 768,
  },
  // Telas do Estoque (27/10/2026): uma por tela, mesmo padrão dos de cima.
  "estoque-visao-geral": {
    titulo: "Como usar a Visão geral do Estoque",
    src: "/videos/zatti-hub-estoque-visao-geral.mp4",
    capa: "/videos/zatti-hub-estoque-visao-geral-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "estoque-produtos": {
    titulo: "Como usar o cadastro de Produtos",
    src: "/videos/zatti-hub-estoque-produtos.mp4",
    capa: "/videos/zatti-hub-estoque-produtos-capa.jpg",
    duracao: "2 min",
    largura: 1664,
    altura: 768,
  },
  "estoque-editar-produtos": {
    titulo: "Como editar os Produtos",
    src: "/videos/zatti-hub-estoque-editar-produtos.mp4",
    capa: "/videos/zatti-hub-estoque-editar-produtos-capa.jpg",
    duracao: "2 min",
    largura: 1664,
    altura: 768,
  },
  "estoque-setores": {
    titulo: "Como montar os Setores",
    src: "/videos/zatti-hub-estoque-setores.mp4",
    capa: "/videos/zatti-hub-estoque-setores-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "estoque-conferir-contagens": {
    titulo: "Como conferir as contagens",
    src: "/videos/zatti-hub-estoque-conferir-contagens.mp4",
    capa: "/videos/zatti-hub-estoque-conferir-contagens-capa.jpg",
    duracao: "1 min",
    largura: 1664,
    altura: 768,
  },
  "estoque-fornecedores": {
    titulo: "Como usar o cadastro de Fornecedores",
    src: "/videos/zatti-hub-estoque-fornecedores.mp4",
    capa: "/videos/zatti-hub-estoque-fornecedores-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "estoque-editar-fornecedores": {
    titulo: "Como editar os Fornecedores",
    src: "/videos/zatti-hub-estoque-editar-fornecedores.mp4",
    capa: "/videos/zatti-hub-estoque-editar-fornecedores-capa.jpg",
    duracao: "2 min",
    largura: 1664,
    altura: 768,
  },
  "estoque-cmv-real": {
    titulo: "Como calcular o CMV Real",
    src: "/videos/zatti-hub-estoque-cmv-real.mp4",
    capa: "/videos/zatti-hub-estoque-cmv-real-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "estoque-perdas": {
    titulo: "Como registrar as perdas",
    src: "/videos/zatti-hub-estoque-perdas.mp4",
    capa: "/videos/zatti-hub-estoque-perdas-capa.jpg",
    duracao: "1 min",
    largura: 1664,
    altura: 768,
  },
  "estoque-movimentacoes": {
    titulo: "Como ler as Movimentações",
    src: "/videos/zatti-hub-estoque-movimentacoes.mp4",
    capa: "/videos/zatti-hub-estoque-movimentacoes-capa.jpg",
    duracao: "1 min",
    largura: 1664,
    altura: 768,
  },
  // Checklist Garante (27/10/2026): uma por tela, mesmo padrão do Estoque.
  "garante-hoje": {
    titulo: "Como usar o Checklist Garante no dia a dia",
    src: "/videos/zatti-hub-garante-hoje.mp4",
    capa: "/videos/zatti-hub-garante-hoje-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "garante-planos": {
    titulo: "Como usar os Planos de ação",
    src: "/videos/zatti-hub-garante-planos.mp4",
    capa: "/videos/zatti-hub-garante-planos-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "garante-quadro": {
    titulo: "Como ler o Quadro do dia",
    src: "/videos/zatti-hub-garante-quadro.mp4",
    capa: "/videos/zatti-hub-garante-quadro-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "garante-nota": {
    titulo: "Como ler a Nota do Checklist Garante",
    src: "/videos/zatti-hub-garante-nota.mp4",
    capa: "/videos/zatti-hub-garante-nota-capa.jpg",
    duracao: "1 min",
    largura: 768,
    altura: 1664,
  },
  "garante-modelos": {
    titulo: "Como montar e publicar os checklists",
    src: "/videos/zatti-hub-garante-modelos.mp4",
    capa: "/videos/zatti-hub-garante-modelos-capa.jpg",
    duracao: "2 min",
    largura: 768,
    altura: 1664,
  },
};

/** Telas com vídeo próprio: nelas o (?) do cabeçalho abre o vídeo em vez de
 * reabrir o tour (pedido de Vinícius em 26/10/2026). Rota exata, sem `?data=`. */
const VIDEO_DA_TELA: Readonly<Record<string, IdVideoAjuda>> = {
  "/estoque/contagem": "contagem",
  "/estoque/pedidos": "cotacao",
  "/estoque/pedidos/cotacoes": "espelhos",
  "/estoque/pedidos/feitos": "pedido-feito",
  "/estoque/visao-geral": "estoque-visao-geral",
  "/estoque/produtos": "estoque-produtos",
  "/estoque/produtos/edicao": "estoque-editar-produtos",
  "/estoque/setores": "estoque-setores",
  "/estoque/contagem/visualizacao": "estoque-conferir-contagens",
  "/estoque/fornecedores": "estoque-fornecedores",
  "/estoque/fornecedores/edicao": "estoque-editar-fornecedores",
  "/estoque/cmv": "estoque-cmv-real",
  "/estoque/contagem/perdas": "estoque-perdas",
  "/estoque/contagem/movimentacoes": "estoque-movimentacoes",
  "/garante": "garante-hoje",
  "/garante/planos": "garante-planos",
  "/garante/quadro": "garante-quadro",
  "/garante/nota": "garante-nota",
  "/garante/modelos": "garante-modelos",
};

/** Vídeo da tela, ou null (aí o (?) continua abrindo o passo a passo). */
export function videoDaTela(pathname: string | null | undefined): IdVideoAjuda | null {
  if (!pathname) return null;
  const rota = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return Object.hasOwn(VIDEO_DA_TELA, rota) ? VIDEO_DA_TELA[rota] : null;
}

/** Vídeo deitado: o player abre na caixa larga e usa a altura da tela. */
export function ehVideoHorizontal(video: Pick<VideoAjuda, "largura" | "altura">): boolean {
  return video.largura > video.altura;
}

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
