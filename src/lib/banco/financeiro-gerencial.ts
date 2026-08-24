import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { CATEGORIAS_PAI_PERMITIDAS } from "@/lib/financeiro-gerencial/categorias";
import { gerarParcelas, somarValores } from "@/lib/financeiro-gerencial/parcelas";
import { PAPEIS_DRE_SOMENTE_PROVISAO } from "@/lib/financeiro-gerencial/tipos";
import type {
  Baixa,
  CategoriaFinanceira,
  ContaFinanceira,
  Lancamento,
  Parcela,
  TipoBaixa,
  TipoContaFinanceira,
  TipoLancamento,
} from "@/lib/financeiro-gerencial/tipos";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Erros de negócio levantados pelos gatilhos de `fin_parcelas`/`fin_baixas`
 * (`proteger_parcela_financeira`, `proteger_baixa_financeira`) chegam aqui
 * como erro do Postgres, com o SQLSTATE que cada `raise exception ... using
 * errcode` declarou - nunca um texto interno vazando, a mensagem já é
 * pensada pra tela. Qualquer outro código é erro inesperado (fica genérico
 * pra quem chama, via `mensagemErroPublica`). */
const SQLSTATE_ERRO_DE_NEGOCIO = new Set(["42501", "23514"]);

function erroDeNegocio(error: { code?: string; message: string }): Error {
  if (error.code && SQLSTATE_ERRO_DE_NEGOCIO.has(error.code)) return new ErroPublico(error.message);
  return new Error(error.message);
}

async function nomesPorUserId(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const idsUnicos = Array.from(new Set(userIds));
  if (idsUnicos.length === 0) return new Map();
  const { data } = await supabase.from("perfis").select("id, nome").in("id", idsUnicos);
  const mapa = new Map<string, string>();
  for (const p of (data as { id: string; nome: string | null }[] | null) ?? []) {
    mapa.set(p.id, p.nome?.trim() || "Usuário");
  }
  return mapa;
}

// ── Contas financeiras ──────────────────────────────────────────────────

type ContaFinanceiraRow = {
  id: string;
  nome: string;
  tipo: TipoContaFinanceira;
  saldo_inicial: number;
  data_saldo_inicial: string;
  ativo: boolean;
};

function contaFinanceiraDaLinha(row: ContaFinanceiraRow): ContaFinanceira {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo,
    saldoInicial: Number(row.saldo_inicial),
    dataSaldoInicial: row.data_saldo_inicial,
    ativo: row.ativo,
  };
}

export async function listarContasFinanceiras(unidadeId: string, somenteAtivas = false): Promise<ContaFinanceira[]> {
  const supabase = await createClient();
  let query = supabase
    .from("fin_contas_financeiras")
    .select("id, nome, tipo, saldo_inicial, data_saldo_inicial, ativo")
    .eq("unidade_id", unidadeId)
    .order("nome");
  if (somenteAtivas) query = query.eq("ativo", true);

  const { data } = await query;
  return ((data as ContaFinanceiraRow[] | null) ?? []).map(contaFinanceiraDaLinha);
}

export async function criarContaFinanceira(params: {
  unidadeId: string;
  nome: string;
  tipo: TipoContaFinanceira;
  saldoInicial: number;
  dataSaldoInicial: string;
  criadoPor: string;
}): Promise<ContaFinanceira> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_contas_financeiras")
    .insert({
      unidade_id: params.unidadeId,
      nome: params.nome,
      tipo: params.tipo,
      saldo_inicial: params.saldoInicial,
      data_saldo_inicial: params.dataSaldoInicial,
      criado_por: params.criadoPor,
    })
    .select("id, nome, tipo, saldo_inicial, data_saldo_inicial, ativo")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao criar conta financeira");
  return contaFinanceiraDaLinha(data as ContaFinanceiraRow);
}

export async function editarContaFinanceira(params: {
  unidadeId: string;
  id: string;
  nome: string;
  tipo: TipoContaFinanceira;
  saldoInicial: number;
  dataSaldoInicial: string;
  ativo: boolean;
}): Promise<ContaFinanceira> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_contas_financeiras")
    .update({
      nome: params.nome,
      tipo: params.tipo,
      saldo_inicial: params.saldoInicial,
      data_saldo_inicial: params.dataSaldoInicial,
      ativo: params.ativo,
    })
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.id)
    .select("id, nome, tipo, saldo_inicial, data_saldo_inicial, ativo")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao editar conta financeira");
  return contaFinanceiraDaLinha(data as ContaFinanceiraRow);
}

// ── Categorias (plano de contas) ────────────────────────────────────────

type CategoriaRow = {
  id: string;
  parent_id: string | null;
  nivel: CategoriaFinanceira["nivel"];
  papel_dre: CategoriaFinanceira["papelDre"];
  nome: string;
  codigo_sistema: string | null;
  padrao: boolean;
  ordem: number;
  arquivado: boolean;
};

function categoriaDaLinha(row: CategoriaRow): CategoriaFinanceira {
  return {
    id: row.id,
    parentId: row.parent_id,
    nivel: row.nivel,
    papelDre: row.papel_dre,
    nome: row.nome,
    codigoSistema: row.codigo_sistema,
    padrao: row.padrao,
    ordem: row.ordem,
    arquivado: row.arquivado,
  };
}

export async function listarCategorias(unidadeId: string): Promise<CategoriaFinanceira[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_categorias")
    .select("id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem, arquivado")
    .eq("unidade_id", unidadeId)
    .order("ordem");
  return ((data as CategoriaRow[] | null) ?? []).map(categoriaDaLinha);
}

/** Cria conta própria dentro de um grupo/subgrupo permitido - o `papelDre`
 * nunca vem do formulário, é resolvido a partir do pai (ver
 * `CATEGORIAS_PAI_PERMITIDAS`), pra uma conta customizada nunca cair no
 * bucket errado da DRE. */
export async function criarCategoriaPersonalizada(params: {
  unidadeId: string;
  parentId: string;
  nome: string;
}): Promise<CategoriaFinanceira> {
  const supabase = await createClient();
  const { data: pai } = await supabase
    .from("fin_categorias")
    .select("id, codigo_sistema, arquivado")
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.parentId)
    .maybeSingle();

  const paiRow = pai as { id: string; codigo_sistema: string | null; arquivado: boolean } | null;
  const papelDre = paiRow?.codigo_sistema ? CATEGORIAS_PAI_PERMITIDAS[paiRow.codigo_sistema] : undefined;
  if (!paiRow || paiRow.arquivado || !papelDre) {
    throw new ErroPublico("Não é permitido criar categoria nesse grupo.");
  }

  const { data, error } = await supabase
    .from("fin_categorias")
    .insert({
      unidade_id: params.unidadeId,
      parent_id: params.parentId,
      nivel: "conta",
      papel_dre: papelDre,
      nome: params.nome,
      codigo_sistema: null,
      padrao: false,
      ordem: 999,
    })
    .select("id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem, arquivado")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao criar categoria");
  return categoriaDaLinha(data as CategoriaRow);
}

/** Renomeia categoria própria - nunca uma padrão. RLS (`padrao = false` no
 * WITH CHECK) e o gatilho `proteger_categoria_financeira` (bloqueia
 * qualquer campo além de nome/arquivado) já impedem tocar em grupo
 * principal, `papelDre` ou categoria padrão - esta função só evita a
 * viagem ao banco pra descobrir depois. */
export async function editarCategoriaPersonalizada(params: {
  unidadeId: string;
  id: string;
  nome: string;
}): Promise<CategoriaFinanceira> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_categorias")
    .update({ nome: params.nome })
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.id)
    .eq("padrao", false)
    .select("id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem, arquivado")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao editar categoria");
  return categoriaDaLinha(data as CategoriaRow);
}

/** Arquiva/desarquiva categoria própria - nunca uma padrão (RLS e o trigger
 * `proteger_categoria_financeira` já bloqueiam isso na base, esta função só
 * evita a viagem ao banco pra descobrir depois). Histórico de lançamentos
 * antigos que usam essa categoria nunca é apagado. */
export async function arquivarCategoriaPersonalizada(params: {
  unidadeId: string;
  id: string;
  arquivado: boolean;
}): Promise<CategoriaFinanceira> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_categorias")
    .update({ arquivado: params.arquivado })
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.id)
    .eq("padrao", false)
    .select("id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem, arquivado")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao arquivar categoria");
  return categoriaDaLinha(data as CategoriaRow);
}

// ── Lançamentos, parcelas e baixas ──────────────────────────────────────

type LancamentoRow = {
  id: string;
  tipo: TipoLancamento;
  categoria_id: string;
  descricao: string;
  data_competencia: string;
  conta_financeira_id: string | null;
  observacao: string;
  criado_por: string;
  criado_em: string;
  fin_categorias: { nome: string } | null;
};

type ParcelaRow = {
  id: string;
  lancamento_id: string;
  numero: number;
  total_parcelas: number;
  valor: number;
  data_prevista: string;
  conta_financeira_id: string | null;
  status: Parcela["status"];
};

async function montarParcelas(supabase: SupabaseClient, lancamentoIds: string[]): Promise<Map<string, Parcela[]>> {
  const porLancamento = new Map<string, Parcela[]>();
  if (lancamentoIds.length === 0) return porLancamento;

  const { data: parcelasData } = await supabase
    .from("fin_parcelas")
    .select("id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id, status")
    .in("lancamento_id", lancamentoIds)
    .order("numero");
  const parcelas = (parcelasData as ParcelaRow[] | null) ?? [];

  const parcelaIds = parcelas.map((p) => p.id);
  const { data: baixasData } =
    parcelaIds.length > 0
      ? await supabase.from("fin_baixas").select("parcela_id, valor, tipo").in("parcela_id", parcelaIds)
      : { data: [] };
  const baixadoPorParcela = new Map<string, number>();
  for (const b of (baixasData as { parcela_id: string; valor: number; tipo: TipoBaixa }[] | null) ?? []) {
    const delta = b.tipo === "estorno" ? -Number(b.valor) : Number(b.valor);
    baixadoPorParcela.set(b.parcela_id, (baixadoPorParcela.get(b.parcela_id) ?? 0) + delta);
  }

  for (const p of parcelas) {
    const lista = porLancamento.get(p.lancamento_id) ?? [];
    lista.push({
      id: p.id,
      lancamentoId: p.lancamento_id,
      numero: p.numero,
      totalParcelas: p.total_parcelas,
      valor: Number(p.valor),
      dataPrevista: p.data_prevista,
      contaFinanceiraId: p.conta_financeira_id,
      status: p.status,
      valorBaixado: baixadoPorParcela.get(p.id) ?? 0,
    });
    porLancamento.set(p.lancamento_id, lista);
  }
  return porLancamento;
}

function lancamentoDaLinha(row: LancamentoRow, parcelas: Parcela[], nomeCriador: string): Lancamento {
  return {
    id: row.id,
    tipo: row.tipo,
    categoriaId: row.categoria_id,
    categoriaNome: row.fin_categorias?.nome ?? "",
    descricao: row.descricao,
    dataCompetencia: row.data_competencia,
    contaFinanceiraId: row.conta_financeira_id,
    observacao: row.observacao,
    origem: "comum",
    criadoPorNome: nomeCriador,
    criadoEm: row.criado_em,
    parcelas,
  };
}

export async function listarLancamentos(
  unidadeId: string,
  filtro?: { tipo?: TipoLancamento; de?: string; ate?: string },
): Promise<Lancamento[]> {
  const supabase = await createClient();
  let query = supabase
    .from("fin_lancamentos")
    .select(
      "id, tipo, categoria_id, descricao, data_competencia, conta_financeira_id, observacao, criado_por, criado_em, fin_categorias(nome)",
    )
    .eq("unidade_id", unidadeId)
    .order("data_competencia", { ascending: false });

  if (filtro?.tipo) query = query.eq("tipo", filtro.tipo);
  if (filtro?.de) query = query.gte("data_competencia", filtro.de);
  if (filtro?.ate) query = query.lte("data_competencia", filtro.ate);

  const { data } = await query;
  const linhas = (data as unknown as LancamentoRow[] | null) ?? [];
  if (linhas.length === 0) return [];

  const [parcelasPorLancamento, nomes] = await Promise.all([
    montarParcelas(supabase, linhas.map((l) => l.id)),
    nomesPorUserId(supabase, linhas.map((l) => l.criado_por)),
  ]);

  return linhas.map((linha) =>
    lancamentoDaLinha(linha, parcelasPorLancamento.get(linha.id) ?? [], nomes.get(linha.criado_por) ?? "Usuário"),
  );
}

export async function obterLancamento(unidadeId: string, id: string): Promise<Lancamento | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_lancamentos")
    .select(
      "id, tipo, categoria_id, descricao, data_competencia, conta_financeira_id, observacao, criado_por, criado_em, fin_categorias(nome)",
    )
    .eq("unidade_id", unidadeId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const linha = data as unknown as LancamentoRow;
  const [parcelasPorLancamento, nomes] = await Promise.all([
    montarParcelas(supabase, [linha.id]),
    nomesPorUserId(supabase, [linha.criado_por]),
  ]);
  return lancamentoDaLinha(linha, parcelasPorLancamento.get(linha.id) ?? [], nomes.get(linha.criado_por) ?? "Usuário");
}

export async function criarLancamento(params: {
  unidadeId: string;
  tipo: TipoLancamento;
  categoriaId: string;
  descricao: string;
  dataCompetencia: string;
  contaFinanceiraId: string | null;
  observacao: string;
  valorTotal: number;
  quantidadeParcelas: number;
  dataPrimeiraParcela: string;
  criadoPor: string;
}): Promise<Lancamento> {
  const supabase = await createClient();

  const { data: categoria } = await supabase
    .from("fin_categorias")
    .select("id, nivel, papel_dre, arquivado")
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.categoriaId)
    .maybeSingle();
  const categoriaRow = categoria as { id: string; nivel: string; papel_dre: string | null; arquivado: boolean } | null;
  if (
    !categoriaRow ||
    categoriaRow.nivel !== "conta" ||
    categoriaRow.arquivado ||
    (categoriaRow.papel_dre && PAPEIS_DRE_SOMENTE_PROVISAO.includes(categoriaRow.papel_dre as never))
  ) {
    throw new ErroPublico("Categoria inválida para lançamento manual.");
  }
  // Só a conta "receita" é receita - todas as outras (Deduções, CMV, CMO,
  // Custos Operacionais, Saídas Não Operacionais) são sempre despesa. Guarda
  // contra a tela de Receitas salvar numa categoria de despesa ou vice-versa.
  const ehCategoriaDeReceita = categoriaRow.papel_dre === "receita";
  if ((params.tipo === "receita") !== ehCategoriaDeReceita) {
    throw new ErroPublico("Categoria não corresponde ao tipo do lançamento.");
  }

  const { data: lancamentoInserido, error: erroLancamento } = await supabase
    .from("fin_lancamentos")
    .insert({
      unidade_id: params.unidadeId,
      tipo: params.tipo,
      categoria_id: params.categoriaId,
      descricao: params.descricao,
      data_competencia: params.dataCompetencia,
      conta_financeira_id: params.contaFinanceiraId,
      observacao: params.observacao,
      criado_por: params.criadoPor,
    })
    .select("id")
    .single();

  if (erroLancamento || !lancamentoInserido) {
    throw new Error(erroLancamento?.message ?? "Falha ao criar lançamento");
  }

  const parcelasGeradas = gerarParcelas(params.valorTotal, params.quantidadeParcelas, params.dataPrimeiraParcela);
  const { error: erroParcelas } = await supabase.from("fin_parcelas").insert(
    parcelasGeradas.map((p) => ({
      unidade_id: params.unidadeId,
      lancamento_id: lancamentoInserido.id,
      numero: p.numero,
      total_parcelas: p.totalParcelas,
      valor: p.valor,
      data_prevista: p.dataPrevista,
      conta_financeira_id: params.contaFinanceiraId,
    })),
  );
  if (erroParcelas) throw new Error(erroParcelas.message);

  const salvo = await obterLancamento(params.unidadeId, lancamentoInserido.id);
  if (!salvo) throw new Error("Lançamento criado mas não encontrado na releitura");
  return salvo;
}

/** Releitura pós-escrita de uma parcela - o `valorBaixado` vem de somar
 * `fin_baixas` (baixa soma, estorno subtrai), o `status` já vem pronto do
 * banco (gatilho `proteger_parcela_financeira`), nunca recalculado aqui. */
async function obterParcela(unidadeId: string, parcelaId: string): Promise<Parcela | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_parcelas")
    .select("id, lancamento_id, numero, total_parcelas, valor, data_prevista, conta_financeira_id, status")
    .eq("unidade_id", unidadeId)
    .eq("id", parcelaId)
    .maybeSingle();
  if (!data) return null;
  const linha = data as ParcelaRow;

  const { data: baixasData } = await supabase.from("fin_baixas").select("valor, tipo").eq("parcela_id", parcelaId);
  const valorBaixado = somarValores(
    ((baixasData as { valor: number; tipo: TipoBaixa }[] | null) ?? []).map((b) =>
      b.tipo === "estorno" ? -Number(b.valor) : Number(b.valor),
    ),
  );

  return {
    id: linha.id,
    lancamentoId: linha.lancamento_id,
    numero: linha.numero,
    totalParcelas: linha.total_parcelas,
    valor: Number(linha.valor),
    dataPrevista: linha.data_prevista,
    contaFinanceiraId: linha.conta_financeira_id,
    status: linha.status,
    valorBaixado,
  };
}

/** Registra pagamento/recebimento total ou parcial. O `insert` é a única
 * escrita feita aqui - saldo em aberto, unidade da conta financeira/parcela
 * e recálculo de status são todos garantidos pelos gatilhos
 * `proteger_baixa_financeira`/`recalcular_parcela_apos_baixa` (ver migração
 * `20260824090000_financeiro_gerencial_fundamentos.sql`), não mais checados
 * aqui em duas viagens separadas ao banco (a versão anterior lia o saldo,
 * decidia em JS e só depois escrevia - uma corrida entre duas baixas
 * simultâneas na mesma parcela podia passar as duas). */
export async function registrarBaixa(params: {
  unidadeId: string;
  parcelaId: string;
  contaFinanceiraId: string;
  valor: number;
  data: string;
  observacao: string;
  criadoPor: string;
}): Promise<Parcela> {
  const supabase = await createClient();

  const { error } = await supabase.from("fin_baixas").insert({
    unidade_id: params.unidadeId,
    parcela_id: params.parcelaId,
    tipo: "baixa",
    conta_financeira_id: params.contaFinanceiraId,
    valor: params.valor,
    data: params.data,
    observacao: params.observacao,
    criado_por: params.criadoPor,
  });
  if (error) throw erroDeNegocio(error);

  const parcela = await obterParcela(params.unidadeId, params.parcelaId);
  if (!parcela) throw new Error("Baixa registrada mas parcela não encontrada na releitura");
  return parcela;
}

/** Estorna uma baixa por completo (nunca parcial) - registra uma linha nova
 * em `fin_baixas` com `tipo = 'estorno'` referenciando a original, nunca
 * edita nem apaga a baixa errada. Restrito a Gestão/master pelo gatilho
 * `proteger_baixa_financeira`, não checado de novo aqui. */
export async function estornarBaixa(params: {
  unidadeId: string;
  baixaId: string;
  observacao: string;
  criadoPor: string;
}): Promise<Parcela> {
  const supabase = await createClient();

  const { data: original } = await supabase
    .from("fin_baixas")
    .select("id, parcela_id, conta_financeira_id, valor")
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.baixaId)
    .eq("tipo", "baixa")
    .maybeSingle();
  const originalRow = original as { id: string; parcela_id: string; conta_financeira_id: string; valor: number } | null;
  if (!originalRow) throw new ErroPublico("Baixa inválida para estorno.");

  const { error } = await supabase.from("fin_baixas").insert({
    unidade_id: params.unidadeId,
    parcela_id: originalRow.parcela_id,
    tipo: "estorno",
    estorno_de_baixa_id: originalRow.id,
    conta_financeira_id: originalRow.conta_financeira_id,
    valor: originalRow.valor,
    data: new Date().toISOString().slice(0, 10),
    observacao: params.observacao,
    criado_por: params.criadoPor,
  });
  if (error) throw erroDeNegocio(error);

  const parcela = await obterParcela(params.unidadeId, originalRow.parcela_id);
  if (!parcela) throw new Error("Estorno registrado mas parcela não encontrada na releitura");
  return parcela;
}

export async function listarBaixasDaParcela(unidadeId: string, parcelaId: string): Promise<Baixa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_baixas")
    .select("id, parcela_id, tipo, estorno_de_baixa_id, conta_financeira_id, valor, data, observacao, criado_por, criado_em")
    .eq("unidade_id", unidadeId)
    .eq("parcela_id", parcelaId)
    .order("data");
  const linhas =
    (data as {
      id: string;
      parcela_id: string;
      tipo: TipoBaixa;
      estorno_de_baixa_id: string | null;
      conta_financeira_id: string;
      valor: number;
      data: string;
      observacao: string;
      criado_por: string;
      criado_em: string;
    }[] | null) ?? [];
  if (linhas.length === 0) return [];

  const nomes = await nomesPorUserId(supabase, linhas.map((l) => l.criado_por));
  return linhas.map((l) => ({
    id: l.id,
    parcelaId: l.parcela_id,
    tipo: l.tipo,
    estornoDeBaixaId: l.estorno_de_baixa_id,
    contaFinanceiraId: l.conta_financeira_id,
    valor: Number(l.valor),
    data: l.data,
    observacao: l.observacao,
    criadoPorNome: nomes.get(l.criado_por) ?? "Usuário",
    criadoEm: l.criado_em,
  }));
}
