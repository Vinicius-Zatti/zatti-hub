/** Acesso aos setores da unidade e à designação produto x setor.
 *
 * Setor só existe na fonte banco. Unidade ainda na planilha continua contando
 * por grupo, como sempre - a tela decide pelo que esta camada devolve: sem
 * setor cadastrado, o fluxo antigo segue valendo. */

import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import type { Setor } from "@/lib/types";
import type { AndamentoSetor, EscopoSetor } from "@/lib/contagem/setor";

export type DesignacaoProduto = {
  sku: string;
  setorIds: string[];
};

export async function listarSetoresBanco(unidadeId: string): Promise<Setor[]> {
  const supabase = await createClient();
  const [{ data: setores, error }, { data: vinculos, error: erroVinculos }] = await Promise.all([
    supabase
      .from("setores")
      .select("id, nome, ordem, ativo")
      .eq("unidade_id", unidadeId)
      .order("ordem")
      .order("nome"),
    supabase.from("produto_setores").select("setor_id").eq("unidade_id", unidadeId),
  ]);
  if (error) throw new Error(`Não foi possível carregar os setores: ${error.message}`);
  if (erroVinculos) throw new Error(`Não foi possível contar os produtos: ${erroVinculos.message}`);

  const porSetor = new Map<string, number>();
  for (const vinculo of vinculos ?? []) {
    const id = vinculo.setor_id as string;
    porSetor.set(id, (porSetor.get(id) ?? 0) + 1);
  }

  return (setores ?? []).map((setor) => ({
    id: setor.id as string,
    nome: setor.nome as string,
    ordem: Number(setor.ordem ?? 0),
    ativo: Boolean(setor.ativo),
    produtos: porSetor.get(setor.id as string) ?? 0,
  }));
}

/** Cria ou edita. Setor nunca é apagado: desativar é `ativo = false`, pra não
 * deixar contagem antiga apontando pra setor que sumiu. */
export async function salvarSetorBanco(
  unidadeId: string,
  setor: { id?: string; nome: string; ordem: number; ativo: boolean },
): Promise<void> {
  const supabase = await createClient();
  if (setor.id) {
    const { error } = await supabase
      .from("setores")
      .update({
        nome: setor.nome,
        ordem: setor.ordem,
        ativo: setor.ativo,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", setor.id)
      .eq("unidade_id", unidadeId);
    if (error) throw traduzirErroDeSetor(error.message);
    return;
  }
  const { error } = await supabase.from("setores").insert({
    unidade_id: unidadeId,
    nome: setor.nome,
    ordem: setor.ordem,
    ativo: setor.ativo,
  });
  if (error) throw traduzirErroDeSetor(error.message);
}

function traduzirErroDeSetor(mensagem: string): Error {
  if (mensagem.includes("setores_nome_unico_por_unidade")) {
    // O índice ignora caixa e espaço nas pontas: "Bar", "bar" e " Bar " colidem.
    return new ErroPublico("Já existe um setor com esse nome nesta unidade.");
  }
  return new Error(`Não foi possível salvar o setor: ${mensagem}`);
}

/** Designação atual, por SKU. O app inteiro fala SKU; produto_id fica aqui. */
export async function listarDesignacoesBanco(
  unidadeId: string,
): Promise<Map<string, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produto_setores")
    .select("setor_id, produtos!inner(sku)")
    .eq("unidade_id", unidadeId);
  if (error) throw new Error(`Não foi possível carregar a designação: ${error.message}`);

  const porSku = new Map<string, string[]>();
  for (const linha of data ?? []) {
    const produto = linha.produtos as unknown as { sku: string };
    const atual = porSku.get(produto.sku) ?? [];
    atual.push(linha.setor_id as string);
    porSku.set(produto.sku, atual);
  }
  return porSku;
}

/** Substitui a designação dos SKUs informados. Produto pode ficar em vários
 * setores; lista vazia tira o produto de todos e ele cai no alerta de "sem
 * setor". Só mexe nos SKUs recebidos. */
export async function salvarDesignacoesBanco(
  unidadeId: string,
  designacoes: DesignacaoProduto[],
): Promise<void> {
  if (designacoes.length === 0) return;
  const supabase = await createClient();

  const skus = designacoes.map((d) => d.sku);
  const { data: produtos, error: erroProdutos } = await supabase
    .from("produtos")
    .select("id, sku")
    .eq("unidade_id", unidadeId)
    .in("sku", skus);
  if (erroProdutos) throw new Error(`Não foi possível localizar os produtos: ${erroProdutos.message}`);

  const idPorSku = new Map((produtos ?? []).map((p) => [p.sku as string, p.id as string]));
  const desconhecidos = skus.filter((sku) => !idPorSku.has(sku));
  if (desconhecidos.length > 0) {
    throw new ErroPublico(`Produto não encontrado nesta unidade: ${desconhecidos.join(", ")}`);
  }

  const produtoIds = skus.map((sku) => idPorSku.get(sku)!);
  const { error: erroApagar } = await supabase
    .from("produto_setores")
    .delete()
    .eq("unidade_id", unidadeId)
    .in("produto_id", produtoIds);
  if (erroApagar) throw new Error(`Não foi possível limpar a designação: ${erroApagar.message}`);

  const novas = designacoes.flatMap((designacao) =>
    designacao.setorIds.map((setorId) => ({
      produto_id: idPorSku.get(designacao.sku)!,
      setor_id: setorId,
      unidade_id: unidadeId,
    })),
  );
  if (novas.length === 0) return;

  const { error } = await supabase.from("produto_setores").insert(novas);
  if (error) {
    // A chave estrangeira composta recusa setor de outra unidade.
    if (error.message.includes("produto_setores_setor_id_unidade_id_fkey")) {
      throw new ErroPublico("Esse setor não é desta unidade.");
    }
    throw new Error(`Não foi possível salvar a designação: ${error.message}`);
  }
}

/** Andamento de cada data: quais setores fecharam e quais estão pendentes.
 * Data sem nenhuma linha aqui é contagem legada e conta como completa. */
export async function listarAndamentoBanco(
  unidadeId: string,
): Promise<Map<string, AndamentoSetor[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contagem_setores")
    .select("situacao, enviado_em, enviado_por, setores!inner(id, nome), contagens!inner(data, unidade_id)")
    .eq("contagens.unidade_id", unidadeId);
  if (error) throw new Error(`Não foi possível carregar o andamento: ${error.message}`);

  const porData = new Map<string, AndamentoSetor[]>();
  for (const linha of data ?? []) {
    const setor = linha.setores as unknown as { id: string; nome: string };
    const contagem = linha.contagens as unknown as { data: string };
    const dataBr = isoParaBr(contagem.data);
    const lista = porData.get(dataBr) ?? [];
    lista.push({
      setorId: setor.id,
      setorNome: setor.nome,
      situacao: linha.situacao as AndamentoSetor["situacao"],
      enviadoEm: (linha.enviado_em as string | null) ?? null,
      enviadoPor: (linha.enviado_por as string | null) ?? null,
    });
    porData.set(dataBr, lista.sort((a, b) => a.setorNome.localeCompare(b.setorNome)));
  }
  return porData;
}

/** Snapshot do escopo de uma data: quem devia contar o quê quando a contagem
 * foi aberta. É isso, e não a designação de hoje, que define a completude. */
export async function listarEscopoBanco(
  unidadeId: string,
  dataBr: string,
): Promise<EscopoSetor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contagem_escopo")
    .select("sku, setores!inner(id, nome), contagens!inner(data, unidade_id)")
    .eq("contagens.unidade_id", unidadeId)
    .eq("contagens.data", brParaIso(dataBr));
  if (error) throw new Error(`Não foi possível carregar o escopo da contagem: ${error.message}`);

  return (data ?? []).map((linha) => {
    const setor = linha.setores as unknown as { id: string; nome: string };
    return { sku: linha.sku as string, setorId: setor.id, setorNome: setor.nome };
  });
}

function isoParaBr(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function brParaIso(data: string): string {
  const [dia, mes, ano] = data.split("/");
  return `${ano}-${mes}-${dia}`;
}
