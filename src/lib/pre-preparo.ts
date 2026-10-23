import { arredondarPreco } from "@/lib/sheets/numero";
import type { CustoFicha } from "@/lib/types";

/** Preço do produto da contagem a partir do custo da ficha vinculada:
 * custo por unidade de rendimento, em centavos. `null` (fica o preço manual)
 * enquanto algum ingrediente não tem preço ou o rendimento é zero. */
export function precoDoCustoDaFicha(custo: CustoFicha): number | null {
  if (!custo.completo || custo.custoPorUnidade === null) return null;
  return arredondarPreco(custo.custoPorUnidade);
}

/** Nome sugerido ao incluir a ficha na contagem: caixa baixa e terminando em
 * "da casa", que é o que separa o produzido do comprado na lista (ver
 * padrao-sku-zatti.md). Medida e sigla (2L, CO2) ficam como estão. */
export function nomeContagemSugerido(nomeFicha: string): string {
  const nome = nomeFicha
    .trim()
    .split(/\s+/)
    .map((palavra) => (/\d/.test(palavra) || (palavra.length > 1 && palavra === palavra.toUpperCase()) ? palavra : palavra.toLowerCase()))
    .join(" ");
  return /\bda casa$/i.test(nome) ? nome : `${nome} da casa`;
}
