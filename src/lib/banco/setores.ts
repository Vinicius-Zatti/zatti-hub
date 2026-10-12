/** Acesso aos setores da unidade e à designação produto x setor.
 *
 * Setor só existe na fonte banco. Unidade ainda na planilha continua contando
 * por grupo, como sempre - a tela decide pelo que esta camada devolve: sem
 * setor cadastrado, o fluxo antigo segue valendo. */

import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { buscarTudo } from "@/lib/banco/paginacao";
import type { Setor } from "@/lib/types";
import type { AndamentoSetor, EscopoSetor } from "@/lib/contagem/setor";

export type DesignacaoProduto = {
  sku: string;
  setorIds: string[];
};

export async function listarSetoresBanco(unidadeId: string): Promise<Setor[]> {
  const supabase = await createClient();
  const [{ data: setores, error }, vinculos] = await Promise.all([
    supabase
      .from("setores")
      .select("id, nome, ordem, ativo")
      .eq("unidade_id", unidadeId)
      .order("ordem")
      .order("nome"),
    // Um vínculo por produto x setor: passa fácil de 1.000 - leitura completa.
    buscarTudo<{ setor_id: string }>((de, ate) =>
      supabase
        .from("produto_setores")
        .select("setor_id")
        .eq("unidade_id", unidadeId)
        .order("produto_id")
        .order("setor_id")
        .range(de, ate),
    ).catch((erro: Error) => {
      throw new Error(`Não foi possível contar os produtos: ${erro.message}`);
    }),
  ]);
  if (error) throw new Error(`Não foi possível carregar os setores: ${error.message}`);

  const porSetor = new Map<string, number>();
  for (const vinculo of vinculos) {
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
  const linhas = await buscarTudo<{ setor_id: string; produtos: unknown }>((de, ate) =>
    supabase
      .from("produto_setores")
      .select("setor_id, produtos!inner(sku)")
      .eq("unidade_id", unidadeId)
      .order("produto_id")
      .order("setor_id")
      .range(de, ate),
  ).catch((erro: Error) => {
    throw new Error(`Não foi possível carregar a designação: ${erro.message}`);
  });

  const porSku = new Map<string, string[]>();
  for (const linha of linhas) {
    const produto = linha.produtos as unknown as { sku: string };
    const atual = porSku.get(produto.sku) ?? [];
    atual.push(linha.setor_id as string);
    porSku.set(produto.sku, atual);
  }
  return porSku;
}

/** Substitui a designação dos SKUs informados. Produto pode ficar em vários
 * setores; lista vazia tira o produto de todos e ele cai no alerta de "sem
 * setor". Só mexe nos SKUs recebidos.
 *
 * Tudo numa função do Postgres (`designar_setores_produtos`): apaga e grava
 * na mesma transação (erro no meio não deixa produto sem setor), recusa SKU
 * repetido ou de fora da unidade e pega a mesma trava da abertura da
 * contagem, então um snapshot nunca vê a designação pela metade. */
export async function salvarDesignacoesBanco(
  unidadeId: string,
  designacoes: DesignacaoProduto[],
): Promise<void> {
  if (designacoes.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("designar_setores_produtos", {
    p_unidade_id: unidadeId,
    p_designacoes: designacoes.map((d) => ({ sku: d.sku, setorIds: d.setorIds })),
  });
  if (error) {
    if (error.code === "P0001") throw new ErroPublico(error.message);
    throw new Error(`Não foi possível salvar a designação: ${error.message}`);
  }
}

/** Andamento de cada data: quais setores fecharam e quais estão pendentes.
 * Data sem nenhuma linha aqui é contagem legada e conta como completa. */
export async function listarAndamentoBanco(
  unidadeId: string,
): Promise<Map<string, AndamentoSetor[]>> {
  const supabase = await createClient();
  // Uma linha por setor de cada contagem: acumula com o tempo - leitura completa.
  const linhas = await buscarTudo<Record<string, unknown>>((de, ate) =>
    supabase
      .from("contagem_setores")
      .select("situacao, enviado_em, enviado_por, versao, setores!inner(id, nome), contagens!inner(data, unidade_id)")
      .eq("contagens.unidade_id", unidadeId)
      .order("id")
      .range(de, ate),
  ).catch((erro: Error) => {
    throw new Error(`Não foi possível carregar o andamento: ${erro.message}`);
  });

  const porData = new Map<string, AndamentoSetor[]>();
  for (const linha of linhas) {
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
      versao: Number(linha.versao ?? 0),
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
  // Um SKU por setor da data: passa de 1.000 numa unidade grande - leitura completa.
  const linhas = await buscarTudo<Record<string, unknown>>((de, ate) =>
    supabase
      .from("contagem_escopo")
      .select("sku, nome, grupo, unidade_base, setores!inner(id, nome), contagens!inner(data, unidade_id)")
      .eq("contagens.unidade_id", unidadeId)
      .eq("contagens.data", brParaIso(dataBr))
      .order("contagem_id")
      .order("setor_id")
      .order("sku")
      .range(de, ate),
  ).catch((erro: Error) => {
    throw new Error(`Não foi possível carregar o escopo da contagem: ${erro.message}`);
  });

  return linhas.map((linha) => {
    const setor = linha.setores as unknown as { id: string; nome: string };
    return {
      sku: linha.sku as string,
      setorId: setor.id,
      setorNome: setor.nome,
      // Congelados na abertura: a lista da data não depende do cadastro atual.
      nome: (linha.nome as string | null) ?? (linha.sku as string),
      grupo: (linha.grupo as string | null) ?? "",
      unidadeBase: (linha.unidade_base as string | null) ?? "",
    };
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
