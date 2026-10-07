// Montagem local do SKU a partir do que a IA devolveu. Função pura (sem IA,
// sem banco) para ser testada isolada. Regra canônica:
// `_conhecimento/negocios/padrao-sku-zatti.md` no Cérebro do Gestor.

export const GRUPOS_INSUMO = ["PRO", "HOR", "LAT", "MER", "CON", "BEB", "BAL", "EMB", "DES", "LIM", "OPE"];

/** Item produzido na casa sempre termina com "da casa" no nome cadastrado -
 * é o marcador que separa o PRE do insumo comprado de mesmo nome. */
export function ehProduzidoNaCasa(nome: string): boolean {
  return /\bda\s+casa\s*$/i.test(nome.trim());
}

function soLetras(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

const LIGACOES = new Set(["DE", "DA", "DO", "DAS", "DOS", "COM", "E"]);

/** As 6 letras do PRE saem do próprio nome, sem depender da IA (padrão
 * canônico): 3 da primeira palavra + 3 da segunda palavra significativa.
 * Palavra única: 6 primeiras letras; se ela tiver menos de 6, 3 primeiras +
 * CAS (pesto da casa -> PESCAS). "da casa" nunca entra fora dessa exceção. */
export function letrasPre(nome: string): string {
  const semMarcador = nome.trim().replace(/\bda\s+casa\s*$/i, "");
  const palavras = semMarcador
    .split(/\s+/)
    .map(soLetras)
    .filter((p) => p && !LIGACOES.has(p));
  if (palavras.length === 0) return "XXXCAS";
  if (palavras.length === 1) {
    const unica = palavras[0];
    return unica.length >= 6 ? unica.slice(0, 6) : unica.slice(0, 3).padEnd(3, "X") + "CAS";
  }
  const primeira = palavras[0].slice(0, 3).padEnd(3, "X");
  const segunda = palavras.slice(1).join("").slice(0, 3).padEnd(3, "X");
  return primeira + segunda;
}

export type EntradaMontagem = {
  nome: string;
  grupoIa: string;
  letrasIa: string;
  referenciaIa: string;
  skusExistentes: Set<string>;
};

export type SkuMontado = { sku: string; grupo: string; avisoColisao: string | null };

export function montarSkuSugerido(entrada: EntradaMontagem): SkuMontado {
  // PRE: PRE + 3 letras + 3 letras, sem número. O grupo sai do marcador
  // "da casa", não da IA - nome sem o marcador nunca vira PRE.
  if (ehProduzidoNaCasa(entrada.nome)) {
    const letras = letrasPre(entrada.nome);
    const sku = `PRE${letras}`;
    return {
      sku,
      grupo: "PRE",
      // PRE não tem número para subir: na colisão, avisa. Salvar com SKU que
      // já existe é recusado no servidor (`inserirProduto`).
      avisoColisao: entrada.skusExistentes.has(sku)
        ? `O SKU ${sku} já existe no cadastro. Ajuste as letras antes de salvar.`
        : null,
    };
  }

  const grupo = GRUPOS_INSUMO.includes(entrada.grupoIa) ? entrada.grupoIa : "MER";
  const letras = soLetras(entrada.letrasIa).padEnd(3, "X").slice(0, 3);
  let ref = entrada.referenciaIa.replace(/[^A-Z0-9]/gi, "").toUpperCase().padStart(3, "0").slice(0, 3);
  let sku = `${grupo}${letras}${ref}`;
  let tentativa = Number(ref) || 1;
  while (entrada.skusExistentes.has(sku) && tentativa < 999) {
    tentativa += 1;
    ref = String(tentativa).padStart(3, "0");
    sku = `${grupo}${letras}${ref}`;
  }
  return { sku, grupo, avisoColisao: null };
}
