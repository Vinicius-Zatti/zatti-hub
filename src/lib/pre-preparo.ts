import { arredondarPreco } from "@/lib/sheets/numero";
import type { CustoFicha } from "@/lib/types";
import { normalizarBusca } from "@/lib/busca";

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

/** Nome comparável para achar ficha e produto que são o mesmo pré-preparo:
 * sem acento, sem caixa, sem pontuação e sem o "da casa" do fim, que a
 * contagem usa e a ficha normalmente não. */
export function nomeComparavelPrePreparo(nome: string): string {
  return normalizarBusca(nome)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+da casa$/, "")
    .replace(/\s+/g, " ");
}

function distanciaEdicao(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** Distância entre dois nomes de pré-preparo, ou `null` quando não são
 * parecidos. Parecido = igual depois de `nomeComparavelPrePreparo` (os
 * espaços também não contam) ou com até 15% das letras diferentes, desde que
 * os números sejam os mesmos ("burger 180g" e "burger 160g" são outros). */
export function distanciaNomesPrePreparo(a: string, b: string): number | null {
  const na = nomeComparavelPrePreparo(a);
  const nb = nomeComparavelPrePreparo(b);
  if (!na || !nb) return null;
  if ((na.match(/\d+/g) ?? []).join(",") !== (nb.match(/\d+/g) ?? []).join(",")) return null;
  const sa = na.replace(/ /g, "");
  const sb = nb.replace(/ /g, "");
  const distancia = distanciaEdicao(sa, sb);
  return distancia <= Math.floor(Math.max(sa.length, sb.length) * 0.15) ? distancia : null;
}

/** Quem nasce primeiro manda no SKU (Vinícius, 23/10/2026). Mesma regra de
 * `unir_pre_preparo_ficha_existente`: ficha estritamente mais antiga dá o SKU
 * dela ao produto; nos outros casos a ficha recebe o SKU do produto. */
export function skuDaUniaoPrePreparo(params: {
  produto: { sku: string; criadoEm: string };
  ficha: { sku: string; criadoEm: string };
}): { skuFinal: string; muda: "ficha" | "produto" } {
  return Date.parse(params.ficha.criadoEm) < Date.parse(params.produto.criadoEm)
    ? { skuFinal: params.ficha.sku, muda: "produto" }
    : { skuFinal: params.produto.sku, muda: "ficha" };
}
