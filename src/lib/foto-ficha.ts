/** Regras da foto opcional da ficha técnica - módulo neutro, usado tanto no
 * navegador (redução antes de enviar) quanto no servidor (conferência antes
 * de gravar no bucket `fichas-tecnicas`).
 *
 * Decisão de Vinícius em 09/10/2026: a foto sempre chega reduzida a no
 * máximo 300 KB, para não pesar no armazenamento. Sem backup da foto por
 * enquanto - se ela se perder, anexa de novo. */

export const BUCKET_FOTOS_FICHA = "fichas-tecnicas";
export const TAMANHO_MAXIMO_FOTO_FICHA = 300 * 1024;
export const LADO_MAXIMO_FOTO_FICHA = 1600;
/** Piso da redução: abaixo disso a foto deixa de servir pra conferir o
 * prato - melhor recusar do que gravar um borrão. */
export const LADO_MINIMO_FOTO_FICHA = 480;
const QUALIDADES = [0.82, 0.72, 0.62, 0.52];

export type TipoFotoFicha = "image/webp" | "image/jpeg";

/** Mantém a proporção e só reduz (nunca amplia foto pequena). */
export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMaximo: number = LADO_MAXIMO_FOTO_FICHA,
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo) return { largura, altura };
  const escala = ladoMaximo / maior;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/** Ordem das tentativas de redução no navegador: primeiro baixa a
 * qualidade no tamanho cheio; se nem a menor qualidade cabe em 300 KB,
 * diminui o lado em 20% e recomeça, até o piso. */
export function tentativasReducao(largura: number, altura: number): { largura: number; altura: number; qualidade: number }[] {
  const tentativas: { largura: number; altura: number; qualidade: number }[] = [];
  let ladoMaximo = Math.min(LADO_MAXIMO_FOTO_FICHA, Math.max(largura, altura));
  for (;;) {
    const dimensoes = dimensoesReduzidas(largura, altura, ladoMaximo);
    for (const qualidade of QUALIDADES) tentativas.push({ ...dimensoes, qualidade });
    if (ladoMaximo <= LADO_MINIMO_FOTO_FICHA) break;
    ladoMaximo = Math.max(LADO_MINIMO_FOTO_FICHA, Math.round(ladoMaximo * 0.8));
  }
  return tentativas;
}

/** Tipo real pelo conteúdo do arquivo (assinatura dos primeiros bytes),
 * nunca pelo nome ou pelo `type` que o navegador declarou. */
export function detectarTipoFoto(bytes: Uint8Array): TipoFotoFicha | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const ascii = (inicio: number, fim: number) => String.fromCharCode(...bytes.slice(inicio, fim));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Caminho no bucket: a 1ª pasta é a unidade (é o que as políticas do
 * Storage conferem), a 2ª é a ficha. Nome aleatório a cada envio, assim a
 * foto nova nunca reaproveita o endereço (nem o cache) da antiga. */
export function caminhoFotoFicha(unidadeId: string, fichaId: string, nomeArquivo: string, tipo: TipoFotoFicha): string {
  const extensao = tipo === "image/webp" ? "webp" : "jpg";
  return `${unidadeId}/${fichaId}/${nomeArquivo}.${extensao}`;
}

/** Só apaga do bucket o que é foto desta ficha nesta unidade - proteção
 * contra `foto_path` antigo ou corrompido apontando pra arquivo alheio. */
const REGEX_NOME_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$/;
export function caminhoPertenceAFicha(caminho: string, unidadeId: string, fichaId: string): boolean {
  const partes = caminho.split("/");
  return partes.length === 3 && partes[0] === unidadeId && partes[1] === fichaId && REGEX_NOME_FOTO.test(partes[2]);
}
