// Avaliações: marca da unidade na página pública e na arte do QR (cores, logo, link do Google).
// Funções puras. O banco confere de novo o formato das cores, o contraste e o link
// (`avaliacoes_salvar_marca`).

export const COR_PRINCIPAL_PADRAO = "#1F4E79";
export const COR_FUNDO_PADRAO = "#FFFFFF";
/** Contraste mínimo entre a cor principal (botões, nota escolhida) e a de fundo. 3 é o mínimo da
 * WCAG para elemento de tela; o texto sempre sai em preto ou branco, o que tiver mais contraste. */
export const CONTRASTE_MINIMO = 3;
export const LIMITE_NOME = 60;
export const LIMITE_AGRADECIMENTO = 200;

/** "#abc", "abc123", "#AbC123" -> "#AABBCC"/"#ABC123". Nulo = não é cor. */
export function normalizarCor(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${t.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t}`.toUpperCase();
  return null;
}

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG (1 a 21) entre duas cores #RRGGBB. Igual a `avaliacoes_contraste` no banco. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Texto em cima de uma cor: preto ou branco, o que contrastar mais. */
export function corTextoSobre(fundo: string): "#111111" | "#FFFFFF" {
  return contraste(fundo, "#111111") >= contraste(fundo, "#FFFFFF") ? "#111111" : "#FFFFFF";
}

export function textoContraste(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Link "Avaliar no Google": vazio = sem botão; senão https e até 500 letras. */
export function normalizarLinkGoogle(bruto: string | null | undefined): { ok: true; valor: string | null } | { ok: false; erro: string } {
  const texto = (bruto ?? "").trim();
  if (!texto) return { ok: true, valor: null };
  if (texto.length > 500) return { ok: false, erro: "O link do Google é longo demais." };
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, erro: "O link do Google não é um endereço válido. Copie o link inteiro, começando com https://." };
  }
  if (url.protocol !== "https:") return { ok: false, erro: "O link do Google precisa começar com https://." };
  return { ok: true, valor: url.toString() };
}

export type EntradaMarca = {
  nomeExibido: string;
  corPrincipal: string;
  corFundo: string;
  textoAgradecimento: string;
  linkGoogle: string;
  ativa: boolean;
};

export type MarcaValidada = {
  nomeExibido: string;
  corPrincipal: string;
  corFundo: string;
  textoAgradecimento: string;
  linkGoogle: string | null;
  ativa: boolean;
};

export function validarMarca(e: EntradaMarca): { ok: true; marca: MarcaValidada } | { ok: false; erro: string } {
  const nome = e.nomeExibido.trim();
  if (nome.length < 2 || nome.length > LIMITE_NOME) return { ok: false, erro: `O nome exibido deve ter de 2 a ${LIMITE_NOME} letras.` };
  const principal = normalizarCor(e.corPrincipal);
  const fundo = normalizarCor(e.corFundo);
  if (!principal || !fundo) return { ok: false, erro: "Cor inválida. Use o seletor de cor ou o código no formato #1F4E79." };
  const c = contraste(principal, fundo);
  if (c < CONTRASTE_MINIMO) {
    return {
      ok: false,
      erro: `A cor principal e a de fundo estão parecidas demais (contraste ${textoContraste(c)}; o mínimo é ${CONTRASTE_MINIMO}). Escureça ou clareie uma delas.`,
    };
  }
  const agradecimento = e.textoAgradecimento.trim();
  if (agradecimento.length < 3 || agradecimento.length > LIMITE_AGRADECIMENTO) {
    return { ok: false, erro: `O texto de agradecimento deve ter de 3 a ${LIMITE_AGRADECIMENTO} letras.` };
  }
  const link = normalizarLinkGoogle(e.linkGoogle);
  if (!link.ok) return link;
  return { ok: true, marca: { nomeExibido: nome, corPrincipal: principal, corFundo: fundo, textoAgradecimento: agradecimento, linkGoogle: link.valor, ativa: e.ativa } };
}

// ── Logo ─────────────────────────────────────────────────────────────────

export const LIMITE_LOGO_BYTES = 300 * 1024;
// Só PNG e JPEG (revisão de 12/11/2026): SVG é código e a logo fica pública no Storage; filtro de
// texto não segura script com prefixo de namespace nem entidade. PNG/JPEG são conferidos pela assinatura.
export const TIPOS_LOGO = { "image/png": "png", "image/jpeg": "jpg" } as const;
export type TipoLogo = keyof typeof TIPOS_LOGO;

/** Confere o arquivo pelo conteúdo (assinatura do PNG/JPEG), não pelo nome nem pelo tipo que o
 * navegador diz. Devolve o tipo certo ou o erro. */
export function validarLogo(bytes: Uint8Array): { ok: true; tipo: TipoLogo } | { ok: false; erro: string } {
  if (bytes.length === 0) return { ok: false, erro: "Escolha o arquivo da logo." };
  if (bytes.length > LIMITE_LOGO_BYTES) return { ok: false, erro: "A logo pode ter até 300 KB. Exporte numa resolução menor (500 px de largura basta)." };
  const png = bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (png) return { ok: true, tipo: "image/png" };
  if (jpeg) return { ok: true, tipo: "image/jpeg" };
  return { ok: false, erro: "Use uma logo em PNG ou JPEG. Se ela estiver em SVG, exporte como PNG." };
}
