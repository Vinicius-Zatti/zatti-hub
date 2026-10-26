import { createClient } from "@/lib/supabase/server";
import { buscarTudo } from "@/lib/banco/paginacao";
import { calcularCustoFicha } from "@/lib/banco/fichas-tecnicas";
import { prePreparoVinculadoHabilitado } from "@/lib/banco/pre-preparo-leitura";
import { ErroPublico } from "@/lib/erros";
import { distanciaNomesPrePreparo, precoDoCustoDaFicha, skuDaUniaoPrePreparo } from "@/lib/pre-preparo";

/** "Usar a ficha existente" (26/10/2026): produto PRE e ficha PRE de nome
 * parecido, sem vínculo, que a pessoa pode unir em vez de criar outra ficha
 * (ou outro produto). Nada se une sozinho - aqui só se acham os pares; quem
 * une é `unir_pre_preparo_ficha_existente`, no banco, de uma vez. */

export type ParPrePreparo = {
  produto: { sku: string; nome: string; unidadeBase: string };
  ficha: { id: string; sku: string; nome: string; rendimentoUnidade: string };
  /** SKU que o item passa a ter (quem nasce primeiro manda). */
  skuFinal: string;
  /** Qual dos dois troca de SKU. */
  muda: "ficha" | "produto";
  /** Preço da contagem depois de unir (custo da ficha por unidade de
   * rendimento); `null` enquanto falta preço de ingrediente. */
  precoDaFicha: number | null;
  /** Por que a união não é possível, já explicado; `null` = pode unir. */
  bloqueio: string | null;
};

type ProdutoRow = { sku: string; nome: string; unidade_base: string; criado_em: string; id: string };
type FichaRow = { id: string; sku: string; nome: string; rendimento_unidade: string; criado_em: string };

/** Todos os pares parecidos da unidade, do mais parecido para o menos.
 * Vazio fora do piloto. */
export async function paresPrePreparoParecidos(unidadeId: string): Promise<ParPrePreparo[]> {
  if (!(await prePreparoVinculadoHabilitado(unidadeId))) return [];
  const supabase = await createClient();
  const [produtos, fichas, vinculadas] = await Promise.all([
    buscarTudo<ProdutoRow>((de, ate) =>
      supabase
        .from("produtos")
        .select("id, sku, nome, unidade_base, criado_em")
        .eq("unidade_id", unidadeId)
        .like("sku", "PRE%")
        .is("ficha_pre_preparo_id", null)
        .order("id")
        .range(de, ate),
    ),
    buscarTudo<FichaRow>((de, ate) =>
      supabase
        .from("fichas_tecnicas")
        .select("id, sku, nome, rendimento_unidade, criado_em")
        .eq("unidade_id", unidadeId)
        .eq("camada", "PRE")
        .order("id")
        .range(de, ate),
    ),
    buscarTudo<{ ficha_pre_preparo_id: string }>((de, ate) =>
      supabase
        .from("produtos")
        .select("ficha_pre_preparo_id")
        .eq("unidade_id", unidadeId)
        .not("ficha_pre_preparo_id", "is", null)
        .order("id")
        .range(de, ate),
    ),
  ]);
  const fichaComProduto = new Set(vinculadas.map((v) => v.ficha_pre_preparo_id));
  const soltas = fichas.filter((f) => !fichaComProduto.has(f.id));

  const candidatos: { produto: ProdutoRow; ficha: FichaRow; distancia: number }[] = [];
  for (const produto of produtos) {
    for (const ficha of soltas) {
      const distancia = distanciaNomesPrePreparo(produto.nome, ficha.nome);
      if (distancia !== null) candidatos.push({ produto, ficha, distancia });
    }
  }
  if (candidatos.length === 0) return [];
  candidatos.sort((a, b) => a.distancia - b.distancia);

  const produtoMuda = candidatos.filter(
    (c) => skuDaUniaoPrePreparo({ produto: { sku: c.produto.sku, criadoEm: c.produto.criado_em }, ficha: { sku: c.ficha.sku, criadoEm: c.ficha.criado_em } }).muda === "produto",
  );
  const comHistorico = await produtosComHistorico(
    unidadeId,
    produtoMuda.map((c) => c.produto),
  );
  const precos = new Map<string, number | null>();
  await Promise.all(
    [...new Set(candidatos.map((c) => c.ficha.id))].map(async (id) => {
      precos.set(id, precoDoCustoDaFicha(await calcularCustoFicha(unidadeId, id)));
    }),
  );

  return candidatos.map(({ produto, ficha }) => {
    const { skuFinal, muda } = skuDaUniaoPrePreparo({
      produto: { sku: produto.sku, criadoEm: produto.criado_em },
      ficha: { sku: ficha.sku, criadoEm: ficha.criado_em },
    });
    const unidadeContagem = produto.unidade_base.trim().toUpperCase();
    let bloqueio: string | null = null;
    if (unidadeContagem !== ficha.rendimento_unidade) {
      bloqueio = `O produto é contado em ${unidadeContagem} e a ficha rende em ${ficha.rendimento_unidade}: deixe os dois na mesma unidade antes de unir.`;
    } else if (muda === "produto" && comHistorico.has(produto.sku)) {
      bloqueio = `A ficha ${ficha.sku} é mais antiga, então o produto passaria de ${produto.sku} para ${ficha.sku}, mas ele já tem contagem, pedido ou extrato, e o histórico não troca de SKU. Para unir, fale com a Zatti.`;
    }
    return {
      produto: { sku: produto.sku, nome: produto.nome, unidadeBase: unidadeContagem },
      ficha: { id: ficha.id, sku: ficha.sku, nome: ficha.nome, rendimentoUnidade: ficha.rendimento_unidade },
      skuFinal,
      muda,
      precoDaFicha: precos.get(ficha.id) ?? null,
      bloqueio,
    };
  });
}

/** SKUs (dentre os pedidos) que já aparecem em contagem, pedido ou extrato:
 * a mesma conferência que o banco faz antes de trocar o SKU do produto. */
async function produtosComHistorico(unidadeId: string, produtos: ProdutoRow[]): Promise<Set<string>> {
  if (produtos.length === 0) return new Set();
  const supabase = await createClient();
  const skus = [...new Set(produtos.map((p) => p.sku))];
  const [contagens, pedidos, extrato] = await Promise.all([
    supabase.from("contagem_itens").select("sku, contagens!inner(unidade_id)").eq("contagens.unidade_id", unidadeId).in("sku", skus).limit(1000),
    supabase.from("pedido_itens").select("sku, pedidos!inner(unidade_id)").eq("pedidos.unidade_id", unidadeId).in("sku", skus).limit(1000),
    supabase.from("estoque_movimentacoes").select("sku, produto_id").eq("unidade_id", unidadeId).in("produto_id", produtos.map((p) => p.id)).limit(1000),
  ]);
  const historico = new Set<string>();
  // Na dúvida (erro de leitura), trata como "tem histórico": o banco confere de novo.
  for (const r of [contagens, pedidos]) {
    if (r.error) return new Set(skus);
    for (const linha of (r.data as { sku: string }[] | null) ?? []) historico.add(linha.sku);
  }
  if (extrato.error) return new Set(skus);
  const skuPorId = new Map(produtos.map((p) => [p.id, p.sku]));
  for (const linha of (extrato.data as { produto_id: string }[] | null) ?? []) {
    const sku = skuPorId.get(linha.produto_id);
    if (sku) historico.add(sku);
  }
  return historico;
}

/** Une de uma vez, no banco. Devolve o SKU que o item passa a ter. */
export async function unirPrePreparoFichaExistente(params: {
  unidadeId: string;
  sku: string;
  fichaId: string;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unir_pre_preparo_ficha_existente", {
    p_unidade_id: params.unidadeId,
    p_sku: params.sku,
    p_ficha_id: params.fichaId,
  });
  if (error) {
    if (error.code === "P0001") throw new ErroPublico(error.message);
    throw new Error(error.message);
  }
  return data as string;
}
