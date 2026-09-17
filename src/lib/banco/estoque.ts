import { createClient } from "@/lib/supabase/server";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import type { Fornecedor, ItemInventario, Produto } from "@/lib/types";

export type NovaContagemBanco = {
  sku: string;
  quantidade: number;
  nomeAvulso?: string;
  unidadeAvulso?: string;
};

type ProdutoRow = {
  sku: string;
  posicao: number | string | null;
  grupo: string;
  nome: string;
  unidade_base: string;
  preco_unitario: number | string | null;
  estoque_necessario_semana: number | string | null;
  estoque_minimo: number | string | null;
  nome_compra: string;
  unidade_embalagem_fornecedor: string;
  qtd_unidade_base_por_embalagem: number | string | null;
  preco_fornecedor: number | string | null;
  fornecedor_1: string;
  fornecedor_2: string;
  fornecedor_3: string;
  fornecedor_4: string;
  observacoes: string;
  ativo: boolean;
  revenda: boolean;
};

type FornecedorRow = {
  codigo: string;
  razao_social: string;
  nome_fantasia: string;
  grupos: string[] | null;
  nome_vendedor: string;
  whatsapp: string;
  condicoes_pagamento: string;
  prazo_boleto: string;
  limite_credito: number | string | null;
  pedido_minimo: number | string | null;
  dias_entrega: string;
  observacoes: string;
};

function numeroOuNull(valor: number | string | null): number | null {
  if (valor === null || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function produtoDaLinha(row: ProdutoRow): Produto {
  return {
    sku: row.sku,
    posicao: numeroOuNull(row.posicao),
    grupo: row.grupo,
    nome: row.nome,
    unidadeBase: row.unidade_base,
    precoUnitario: numeroOuNull(row.preco_unitario),
    estoqueNecessarioSemana: numeroOuNull(row.estoque_necessario_semana),
    estoqueMinimo: numeroOuNull(row.estoque_minimo),
    nomeCompra: row.nome_compra,
    unidadeEmbalagemFornecedor: row.unidade_embalagem_fornecedor,
    qtdUnidadeBasePorEmbalagem: numeroOuNull(row.qtd_unidade_base_por_embalagem),
    precoFornecedor: numeroOuNull(row.preco_fornecedor),
    fornecedor1: row.fornecedor_1,
    fornecedor2: row.fornecedor_2,
    fornecedor3: row.fornecedor_3,
    fornecedor4: row.fornecedor_4,
    observacoes: row.observacoes,
    ativo: row.ativo,
    revenda: row.revenda,
  };
}

function fornecedorDaLinha(row: FornecedorRow): Fornecedor {
  return {
    codigo: row.codigo,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    grupos: row.grupos ?? [],
    nomeVendedor: row.nome_vendedor,
    whatsapp: row.whatsapp,
    condicoesPagamento: row.condicoes_pagamento,
    prazoBoleto: row.prazo_boleto,
    limiteCredito: numeroOuNull(row.limite_credito),
    pedidoMinimo: numeroOuNull(row.pedido_minimo),
    diasEntrega: row.dias_entrega,
    observacoes: row.observacoes,
  };
}

export async function listarProdutosBanco(unidadeId: string): Promise<Produto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select("sku, posicao, grupo, nome, unidade_base, preco_unitario, estoque_necessario_semana, estoque_minimo, nome_compra, unidade_embalagem_fornecedor, qtd_unidade_base_por_embalagem, preco_fornecedor, fornecedor_1, fornecedor_2, fornecedor_3, fornecedor_4, observacoes, ativo, revenda")
    .eq("unidade_id", unidadeId)
    .order("ordem");
  if (error) throw new Error(`Não foi possível carregar os produtos: ${error.message}`);
  return ((data as ProdutoRow[] | null) ?? []).map(produtoDaLinha);
}

export async function salvarProdutosBanco(
  produtos: Produto[],
  unidadeId: string,
): Promise<void> {
  if (produtos.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").upsert(
    produtos.map((produto) => ({
      unidade_id: unidadeId,
      sku: produto.sku,
      posicao: produto.posicao,
      grupo: produto.grupo,
      nome: produto.nome,
      unidade_base: produto.unidadeBase,
      preco_unitario: produto.precoUnitario,
      estoque_necessario_semana: produto.estoqueNecessarioSemana,
      estoque_minimo: produto.estoqueMinimo,
      nome_compra: produto.nomeCompra,
      unidade_embalagem_fornecedor: produto.unidadeEmbalagemFornecedor,
      qtd_unidade_base_por_embalagem: produto.qtdUnidadeBasePorEmbalagem,
      preco_fornecedor: produto.precoFornecedor,
      fornecedor_1: produto.fornecedor1,
      fornecedor_2: produto.fornecedor2,
      fornecedor_3: produto.fornecedor3,
      fornecedor_4: produto.fornecedor4,
      observacoes: produto.observacoes,
      ativo: produto.ativo,
      revenda: produto.revenda,
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: "unidade_id,sku" },
  );
  if (error) throw new Error(`Não foi possível salvar os produtos: ${error.message}`);
}

/** Exclui o produto e, na mesma transação, remove a conversão de unidade
 * (se houver) e qualquer componente de Ficha Técnica que aponte pra esse
 * SKU - o cliente pediu que excluir remova também da(s) F.T., em vez de
 * bloquear (diferente de excluir uma ficha, que aí sim bloqueia se estiver
 * em uso). Ver `excluir_produto_estoque` em
 * 20260819130000_produtos_excluir.sql. Devolve quantos componentes de
 * ficha foram removidos, pra UI avisar. */
export async function excluirProdutoBanco(unidadeId: string, sku: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("excluir_produto_estoque", {
    p_unidade_id: unidadeId,
    p_sku: sku,
  });
  if (error) throw new Error(`Não foi possível excluir o produto: ${error.message}`);
  return (data as number | null) ?? 0;
}

export async function listarFornecedoresBanco(unidadeId: string): Promise<Fornecedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("codigo, razao_social, nome_fantasia, grupos, nome_vendedor, whatsapp, condicoes_pagamento, prazo_boleto, limite_credito, pedido_minimo, dias_entrega, observacoes")
    .eq("unidade_id", unidadeId)
    .order("ordem");
  if (error) throw new Error(`Não foi possível carregar os fornecedores: ${error.message}`);
  return ((data as FornecedorRow[] | null) ?? []).map(fornecedorDaLinha);
}

export async function salvarFornecedoresBanco(
  fornecedores: Fornecedor[],
  unidadeId: string,
): Promise<void> {
  if (fornecedores.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").upsert(
    fornecedores.map((fornecedor) => ({
      unidade_id: unidadeId,
      codigo: fornecedor.codigo,
      razao_social: fornecedor.razaoSocial,
      nome_fantasia: fornecedor.nomeFantasia,
      grupos: fornecedor.grupos,
      nome_vendedor: fornecedor.nomeVendedor,
      whatsapp: fornecedor.whatsapp,
      condicoes_pagamento: fornecedor.condicoesPagamento,
      prazo_boleto: fornecedor.prazoBoleto,
      limite_credito: fornecedor.limiteCredito,
      pedido_minimo: fornecedor.pedidoMinimo,
      dias_entrega: fornecedor.diasEntrega,
      observacoes: fornecedor.observacoes,
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: "unidade_id,codigo" },
  );
  if (error) throw new Error(`Não foi possível salvar os fornecedores: ${error.message}`);
}

function dataBrParaIso(data: string): string {
  const [dia, mes, ano] = data.split("/").map(Number);
  if (!dia || !mes || !ano) throw new Error("Data de contagem inválida.");
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function dataIsoParaBr(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function calcularAlerta(
  quantidade: number | null,
  precoUnitario: number | null,
  produto: Produto | undefined,
): string {
  if (quantidade === null) return "";
  if (precoUnitario === null) return "Falta preço no cadastro";
  if (!produto) return "";
  if (
    produto.estoqueNecessarioSemana !== null &&
    quantidade > produto.estoqueNecessarioSemana * 2
  ) {
    return "Possível erro de contagem";
  }
  if (produto.estoqueMinimo !== null && quantidade < produto.estoqueMinimo) {
    return "Comprar emergencial";
  }
  return "";
}

export async function listarInventarioBanco(unidadeId: string): Promise<ItemInventario[]> {
  const supabase = await createClient();
  const { data: contagens, error: erroContagens } = await supabase
    .from("contagens")
    .select("id, data, mes")
    .eq("unidade_id", unidadeId);
  if (erroContagens) throw new Error(`Não foi possível carregar as contagens: ${erroContagens.message}`);
  if (!contagens?.length) return [];

  const contagemPorId = new Map(
    contagens.map((contagem) => [contagem.id, { data: contagem.data, mes: contagem.mes }]),
  );
  const [{ data: itens, error: erroItens }, nomePorSetor] = await Promise.all([
    supabase
      .from("contagem_itens")
      .select(
        "id, contagem_id, setor_id, sku, grupo, nome, unidade_base, quantidade, preco_unitario, total, alerta",
      )
      .in("contagem_id", contagens.map((contagem) => contagem.id))
      .order("ordem"),
    nomesDeSetor(unidadeId),
  ]);
  if (erroItens) throw new Error(`Não foi possível carregar os itens contados: ${erroItens.message}`);

  return (itens ?? []).map((item) => {
    const contagem = contagemPorId.get(item.contagem_id)!;
    return {
      data: dataIsoParaBr(contagem.data),
      mes: contagem.mes,
      sku: item.sku,
      grupo: item.grupo,
      nome: item.nome,
      unidadeBase: item.unidade_base,
      quantidade: numeroOuNull(item.quantidade),
      precoUnitario: numeroOuNull(item.preco_unitario),
      total: numeroOuNull(item.total),
      alerta: item.alerta,
      id: item.id,
      setorId: item.setor_id,
      // Linha legada (anterior à contagem por setor) fica sem nome mesmo.
      setorNome: item.setor_id ? (nomePorSetor.get(item.setor_id) ?? "") : null,
    };
  });
}

/** Nome de cada setor da unidade, inclusive os desativados - contagem antiga
 * precisa continuar mostrando o setor que a fez.
 *
 * Com a contagem por setor desligada, nem consulta: assim a listagem de
 * estoque não passa a depender da tabela `setores`, e a ordem entre migração
 * e deploy deixa de poder quebrar o fluxo que já existia. */
async function nomesDeSetor(unidadeId: string): Promise<Map<string, string>> {
  if (!CONTAGEM_POR_SETOR_ATIVA) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("setores")
    .select("id, nome")
    .eq("unidade_id", unidadeId);
  if (error) throw new Error(`Não foi possível carregar os setores: ${error.message}`);
  return new Map((data ?? []).map((setor) => [setor.id as string, setor.nome as string]));
}

export async function registrarContagemBanco(
  data: string,
  mes: string,
  linhas: NovaContagemBanco[],
  unidadeId: string,
  userId: string,
): Promise<void> {
  if (linhas.length === 0) return;
  const supabase = await createClient();
  const dataIso = dataBrParaIso(data);

  const { data: contagemEncontrada, error: erroContagem } = await supabase
    .from("contagens")
    .select("id")
    .eq("unidade_id", unidadeId)
    .eq("data", dataIso)
    .maybeSingle();

  if (erroContagem) throw new Error(`Não foi possível localizar a contagem: ${erroContagem.message}`);
  let contagem = contagemEncontrada;
  if (!contagem) {
    const criada = await supabase
      .from("contagens")
      .insert({ unidade_id: unidadeId, data: dataIso, mes, criado_por: userId })
      .select("id")
      .single();
    if (criada.error) throw new Error(`Não foi possível criar a contagem: ${criada.error.message}`);
    contagem = criada.data;
  }

  const produtos = await listarProdutosBanco(unidadeId);
  const porSku = new Map(produtos.map((produto) => [produto.sku, produto]));
  const { error: erroItens } = await supabase.from("contagem_itens").insert(
    linhas.map(({ sku, quantidade, nomeAvulso, unidadeAvulso }) => {
      if (nomeAvulso) {
        return {
          contagem_id: contagem!.id,
          sku,
          nome: nomeAvulso,
          unidade_base: unidadeAvulso || "UN",
          quantidade,
          alerta: "Sem cadastro, falta criar produto",
        };
      }
      const produto = porSku.get(sku);
      const precoUnitario = produto?.precoUnitario ?? null;
      return {
        contagem_id: contagem!.id,
        sku,
        grupo: produto?.grupo ?? "",
        nome: produto?.nome ?? "",
        unidade_base: produto?.unidadeBase ?? "",
        quantidade,
        preco_unitario: precoUnitario,
        total: precoUnitario === null ? null : Number((quantidade * precoUnitario).toFixed(2)),
        alerta: calcularAlerta(quantidade, precoUnitario, produto),
      };
    }),
  );
  if (erroItens) throw new Error(`Não foi possível registrar os itens: ${erroItens.message}`);
}

export async function atualizarQuantidadeInventarioBanco(
  data: string,
  sku: string,
  quantidade: number,
  unidadeId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: contagem, error: erroContagem } = await supabase
    .from("contagens")
    .select("id")
    .eq("unidade_id", unidadeId)
    .eq("data", dataBrParaIso(data))
    .maybeSingle();
  if (erroContagem) throw new Error(`Não foi possível localizar a contagem: ${erroContagem.message}`);
  if (!contagem) throw new Error("Não achei essa contagem para corrigir.");

  const { data: itens, error: erroItem } = await supabase
    .from("contagem_itens")
    .select("id, preco_unitario")
    .eq("contagem_id", contagem.id)
    .eq("sku", sku)
    .order("ordem")
    .limit(1);
  if (erroItem) throw new Error(`Não foi possível localizar o item: ${erroItem.message}`);
  const item = itens?.[0];
  if (!item) {
    throw new Error("Não achei essa contagem para corrigir - ela pode ter sido alterada por outra pessoa.");
  }

  const produto = (await listarProdutosBanco(unidadeId)).find((atual) => atual.sku === sku);
  const precoUnitario = numeroOuNull(item.preco_unitario);
  const total = precoUnitario === null ? null : Number((quantidade * precoUnitario).toFixed(2));
  const alerta = calcularAlerta(quantidade, precoUnitario, produto);
  const { error } = await supabase
    .from("contagem_itens")
    .update({ quantidade, total, alerta })
    .eq("id", item.id);
  if (error) throw new Error(`Não foi possível corrigir a quantidade: ${error.message}`);
}

// --- Contagem por setor -----------------------------------------------------

export type LinhaContagemSetor = {
  sku: string;
  quantidade: number | null;
  nomeAvulso?: string;
  unidadeAvulso?: string;
};

/** Abre (ou reaproveita) a contagem da data e congela o snapshot de escopo.
 * Chamada no "Iniciar contagem". A idempotência e a trava de concorrência
 * estão na função do Postgres, não aqui. */
export async function abrirContagemBanco(
  unidadeId: string,
  dataBr: string,
  mes: string,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("abrir_contagem_setor", {
    p_unidade_id: unidadeId,
    p_data: dataBrParaIso(dataBr),
    p_mes: mes,
  });
  if (error) throw new Error(`Não foi possível abrir a contagem: ${error.message}`);
  if (!data) throw new Error("Não foi possível abrir a contagem.");
  return data as string;
}

/** Grava a contagem de um setor substituindo o que aquele setor já tinha
 * gravado na data. Tudo numa transação só, dentro do Postgres. */
export async function substituirContagemSetorBanco(
  contagemId: string,
  setorId: string,
  linhas: LinhaContagemSetor[],
  unidadeId: string,
): Promise<number> {
  const supabase = await createClient();
  const produtos = await listarProdutosBanco(unidadeId);
  const porSku = new Map(produtos.map((produto) => [produto.sku, produto]));

  const itens = linhas.map((linha) => {
    const produto = porSku.get(linha.sku);
    const precoUnitario = produto?.precoUnitario ?? null;
    const quantidade = linha.quantidade;
    const total =
      precoUnitario === null || quantidade === null
        ? null
        : Number((quantidade * precoUnitario).toFixed(2));
    if (linha.nomeAvulso) {
      return {
        sku: linha.sku,
        grupo: "",
        nome: linha.nomeAvulso,
        unidade_base: linha.unidadeAvulso || "UN",
        quantidade,
        preco_unitario: null,
        total: null,
        alerta: "Sem cadastro, falta criar produto",
      };
    }
    return {
      sku: linha.sku,
      grupo: produto?.grupo ?? "",
      nome: produto?.nome ?? "",
      unidade_base: produto?.unidadeBase ?? "",
      quantidade,
      preco_unitario: precoUnitario,
      total,
      alerta: calcularAlerta(quantidade, precoUnitario, produto),
    };
  });

  const { data, error } = await supabase.rpc("substituir_contagem_setor", {
    p_contagem_id: contagemId,
    p_setor_id: setorId,
    p_itens: itens,
  });
  if (error) throw new Error(`Não foi possível gravar a contagem do setor: ${error.message}`);
  return Number(data ?? 0);
}

/** Corrige a quantidade de UM item, identificado pelo id. Nunca pelo primeiro
 * SKU encontrado: com setor, o mesmo SKU existe em várias linhas da mesma
 * contagem, e corrigir "o primeiro" mexeria no setor errado. */
export async function atualizarQuantidadeItemBanco(
  itemId: string,
  quantidade: number,
  unidadeId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: item, error: erroItem } = await supabase
    .from("contagem_itens")
    .select("id, sku, preco_unitario, contagem_id, contagens!inner(unidade_id)")
    .eq("id", itemId)
    .maybeSingle();
  if (erroItem) throw new Error(`Não foi possível localizar o item: ${erroItem.message}`);
  if (!item) throw new Error("Não achei esse item para corrigir.");

  const contagem = item.contagens as unknown as { unidade_id: string } | null;
  if (!contagem || contagem.unidade_id !== unidadeId) {
    throw new Error("Esse item não pertence à unidade atual.");
  }

  const produto = (await listarProdutosBanco(unidadeId)).find((p) => p.sku === item.sku);
  const precoUnitario = numeroOuNull(item.preco_unitario);
  const total = precoUnitario === null ? null : Number((quantidade * precoUnitario).toFixed(2));
  const alerta = calcularAlerta(quantidade, precoUnitario, produto);
  const { error } = await supabase
    .from("contagem_itens")
    .update({ quantidade, total, alerta })
    .eq("id", itemId);
  if (error) throw new Error(`Não foi possível corrigir a quantidade: ${error.message}`);
}
