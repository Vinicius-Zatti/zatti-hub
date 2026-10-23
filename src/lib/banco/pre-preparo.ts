import { createClient } from "@/lib/supabase/server";
import { buscarTudo } from "@/lib/banco/paginacao";
import { linhaProdutoBanco } from "@/lib/banco/estoque";
import { calcularCustoFicha } from "@/lib/banco/fichas-tecnicas";
import { ErroPublico } from "@/lib/erros";
import { precoDoCustoDaFicha } from "@/lib/pre-preparo";
import { prePreparoVinculadoHabilitado } from "@/lib/banco/pre-preparo-leitura";
import type { Produto, StatusFicha, UnidadeRendimentoFicha } from "@/lib/types";

export { prePreparoVinculadoHabilitado };

/** Pré-preparo vinculado (piloto Zatti Burger, 23/10/2026): o produto PRE da
 * contagem e a ficha PRE viram o mesmo item, com um SKU só - ver a migração
 * 20261023180000_pre_preparo_vinculado.sql. Tudo aqui só roda em unidade com
 * `pre_preparo_vinculado_habilitado`; as outras seguem exatamente como antes. */

export type VinculoPrePreparo = {
  prePreparo: boolean;
  fichaId: string | null;
  fichaStatus: StatusFicha | null;
};

type VinculoRow = {
  sku: string;
  pre_preparo: boolean;
  ficha_pre_preparo_id: string | null;
  ficha: { status: StatusFicha } | null;
};

async function lerVinculos(unidadeId: string, somenteMarcados: boolean): Promise<VinculoRow[]> {
  const supabase = await createClient();
  return buscarTudo<VinculoRow>((de, ate) => {
    let consulta = supabase
      .from("produtos")
      .select("sku, pre_preparo, ficha_pre_preparo_id, ficha:fichas_tecnicas!produtos_ficha_pre_preparo_id_fkey(status)")
      .eq("unidade_id", unidadeId);
    consulta = somenteMarcados
      ? consulta.eq("pre_preparo", true)
      : consulta.or("pre_preparo.eq.true,ficha_pre_preparo_id.not.is.null");
    return consulta.order("id").range(de, ate);
  });
}

/** Só os produtos marcados ou vinculados (os demais são "não pré-preparo"). */
export async function lerVinculosPrePreparo(unidadeId: string): Promise<Map<string, VinculoPrePreparo>> {
  const linhas = await lerVinculos(unidadeId, false);
  return new Map(
    linhas.map((r) => [
      r.sku,
      { prePreparo: r.pre_preparo, fichaId: r.ficha_pre_preparo_id, fichaStatus: r.ficha?.status ?? null },
    ]),
  );
}

function mensagemDoBanco(err: { code?: string; message: string }): string {
  return err.code === "P0001" ? err.message : "erro inesperado ao gravar";
}

/** Depois de salvar a grade de Produtos: marcado sem ficha cria o rascunho
 * da ficha (SKU, nome e unidade do produto); marcado com ficha inativa
 * reativa a mesma ficha; desmarcado deixa a ficha inativa (nunca exclui) e o
 * preço para de vir dela, fica o último calculado e volta a ser manual.
 * Devolve uma mensagem por produto que não deu certo - os produtos em si já
 * foram salvos. */
export async function sincronizarPrePreparos(
  unidadeId: string,
  produtos: { sku: string; nome: string; prePreparo: boolean }[],
): Promise<string[]> {
  if (produtos.length === 0) return [];
  const supabase = await createClient();
  const atuais = await lerVinculosPrePreparo(unidadeId);
  const erros: string[] = [];

  for (const produto of produtos) {
    const atual = atuais.get(produto.sku);
    try {
      if (produto.prePreparo) {
        if (!atual?.fichaId) {
          // Só cria quando a chave acabou de ser ligada (nunca para "recriar"
          // uma ficha que alguém excluiu - o banco desmarca nesse caso).
          if (atual?.prePreparo) continue;
          const { error } = await supabase.rpc("criar_ficha_pre_preparo_do_produto", {
            p_unidade_id: unidadeId,
            p_sku: produto.sku,
          });
          if (error) throw error;
          continue;
        }
        if (!atual.prePreparo) {
          const { error } = await supabase
            .from("produtos")
            .update({ pre_preparo: true })
            .eq("unidade_id", unidadeId)
            .eq("sku", produto.sku);
          if (error) throw error;
        }
        if (atual.fichaStatus === "inativa") {
          const { error } = await supabase
            .from("fichas_tecnicas")
            .update({ status: await statusAoReativar(unidadeId, atual.fichaId) })
            .eq("unidade_id", unidadeId)
            .eq("id", atual.fichaId);
          if (error) throw error;
        }
      } else if (atual?.prePreparo) {
        const { error } = await supabase.rpc("desmarcar_pre_preparo", {
          p_unidade_id: unidadeId,
          p_sku: produto.sku,
        });
        if (error) throw error;
      }
    } catch (err) {
      const e = err as { code?: string; message: string };
      if (e.code !== "P0001") console.error(`Falha no pré-preparo ${produto.sku}:`, err);
      erros.push(`${produto.nome}: ${mensagemDoBanco(e)}`);
    }
  }
  return erros;
}

/** Ficha com ingredientes volta ativa; sem nenhum, volta rascunho. */
async function statusAoReativar(unidadeId: string, fichaId: string): Promise<StatusFicha> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("ficha_componentes")
    .select("id", { count: "exact", head: true })
    .eq("unidade_id", unidadeId)
    .eq("ficha_id", fichaId);
  return (count ?? 0) > 0 ? "ativa" : "rascunho";
}

/** Grava no produto o custo por unidade da ficha vinculada, quando a ficha
 * está ativa ou em rascunho e tem custo completo (todo ingrediente com
 * preço). Ficha sem custo completo não mexe no preço: fica o manual. Chamado
 * depois de tudo que muda custo de insumo ou de ficha. O preço fica gravado
 * (e não calculado na leitura) porque a contagem congela o preço do produto
 * no momento em que é feita, inclusive dentro das funções do banco. */
export async function sincronizarCustosPrePreparo(unidadeId: string): Promise<void> {
  if (!(await prePreparoVinculadoHabilitado(unidadeId))) return;
  const supabase = await createClient();
  const linhas = await lerVinculos(unidadeId, true);
  const vinculados = linhas.filter((r) => r.ficha_pre_preparo_id && r.ficha && r.ficha.status !== "inativa");
  if (vinculados.length === 0) return;

  const { data: precosData } = await supabase
    .from("produtos")
    .select("sku, preco_unitario")
    .eq("unidade_id", unidadeId)
    .in(
      "sku",
      vinculados.map((r) => r.sku),
    );
  const precoAtual = new Map(
    ((precosData as { sku: string; preco_unitario: number | string | null }[] | null) ?? []).map((r) => [
      r.sku,
      r.preco_unitario === null ? null : Number(r.preco_unitario),
    ]),
  );

  // Um pré-preparo pode ser ingrediente de outro (o banco impede ciclo):
  // repete até nenhum preço mudar, para o de fora usar o preço novo do de
  // dentro. Cada passada estabiliza ao menos um nível.
  for (let passada = 0; passada <= vinculados.length; passada++) {
    const custos = await Promise.all(
      vinculados.map(async (r) => [r.sku, precoDoCustoDaFicha(await calcularCustoFicha(unidadeId, r.ficha_pre_preparo_id!))] as const),
    );
    const mudancas = custos.filter(([sku, novo]) => novo !== null && precoAtual.get(sku) !== novo);
    if (mudancas.length === 0) return;
    for (const [sku, novo] of mudancas) {
      const { error } = await supabase
        .from("produtos")
        .update({ preco_unitario: novo, atualizado_em: new Date().toISOString() })
        .eq("unidade_id", unidadeId)
        .eq("sku", sku);
      if (error) {
        console.error(`Falha ao gravar o custo do pré-preparo ${sku}:`, error);
        return;
      }
      precoAtual.set(sku, novo);
    }
  }
}

/** Melhor esforço: o que disparou (salvar ficha, produto ou pedido) já deu
 * certo, e o próximo salvamento tenta de novo. */
export async function sincronizarCustosPrePreparoMelhorEsforco(unidadeId: string): Promise<void> {
  try {
    await sincronizarCustosPrePreparo(unidadeId);
  } catch (err) {
    console.error("Falha ao atualizar o custo dos pré-preparos:", err);
  }
}

/** Caminho "ficha primeiro": cria o produto da contagem com o SKU da ficha,
 * grupo PRE e a unidade de rendimento dela. Preço já sai do custo da ficha
 * quando estiver completo. */
export async function incluirFichaNaContagem(params: {
  unidadeId: string;
  fichaId: string;
  nome: string;
}): Promise<Produto> {
  const supabase = await createClient();
  const { data: fichaData, error: erroFicha } = await supabase
    .from("fichas_tecnicas")
    .select("id, sku, camada, rendimento_unidade")
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.fichaId)
    .maybeSingle();
  if (erroFicha) throw new Error(erroFicha.message);
  const ficha = fichaData as { id: string; sku: string; camada: string; rendimento_unidade: UnidadeRendimentoFicha } | null;
  if (!ficha) throw new ErroPublico("Ficha técnica não encontrada.");
  if (ficha.camada !== "PRE") throw new ErroPublico("Só ficha de pré-preparo entra na lista de contagem.");

  const preco = precoDoCustoDaFicha(await calcularCustoFicha(params.unidadeId, ficha.id));
  const produto: Produto = {
    sku: ficha.sku,
    posicao: null,
    grupo: "PRE",
    nome: params.nome,
    unidadeBase: ficha.rendimento_unidade,
    precoUnitario: preco,
    estoqueNecessarioSemana: null,
    estoqueMinimo: null,
    nomeCompra: "",
    unidadeEmbalagemFornecedor: "",
    qtdUnidadeBasePorEmbalagem: null,
    precoFornecedor: null,
    fornecedor1: "",
    fornecedor2: "",
    fornecedor3: "",
    fornecedor4: "",
    observacoes: "",
    ativo: true,
    revenda: false,
    prePreparo: true,
  };
  const { error } = await supabase.from("produtos").insert({
    ...linhaProdutoBanco(produto, params.unidadeId),
    pre_preparo: true,
    ficha_pre_preparo_id: ficha.id,
  });
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Esta ficha já está na lista de contagem.");
    if (error.code === "P0001") throw new ErroPublico(error.message);
    throw new Error(error.message);
  }
  return produto;
}

/** O que a grade de Edição de Dados precisa: a chave de cada produto e quais
 * têm o preço vindo da ficha (ficha ativa ou rascunho com custo completo).
 * `null` fora do piloto - a coluna nem aparece. */
export async function dadosPrePreparoDaGrade(
  unidadeId: string,
): Promise<{ marcados: Set<string>; skusPrecoDaFicha: string[] } | null> {
  if (!(await prePreparoVinculadoHabilitado(unidadeId))) return null;
  const vinculos = await lerVinculosPrePreparo(unidadeId);
  const marcados = new Set<string>();
  const comFicha: [string, string][] = [];
  for (const [sku, v] of vinculos) {
    if (!v.prePreparo) continue;
    marcados.add(sku);
    if (v.fichaId && v.fichaStatus !== "inativa") comFicha.push([sku, v.fichaId]);
  }
  const custos = await Promise.all(
    comFicha.map(async ([sku, fichaId]) => [sku, precoDoCustoDaFicha(await calcularCustoFicha(unidadeId, fichaId))] as const),
  );
  const skusPrecoDaFicha = custos.filter(([, preco]) => preco !== null).map(([sku]) => sku);
  return { marcados, skusPrecoDaFicha };
}
