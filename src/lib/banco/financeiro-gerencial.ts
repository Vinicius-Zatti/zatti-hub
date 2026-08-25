import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { CATEGORIAS_PAI_PERMITIDAS } from "@/lib/financeiro-gerencial/categorias";
import { calcularSaldoAberto, numerarParcelasManuais, somarValores } from "@/lib/financeiro-gerencial/parcelas";
import { gerarOcorrenciasRecorrencia, type FimRecorrencia } from "@/lib/financeiro-gerencial/recorrencia";
import { PAPEIS_DRE_SOMENTE_PROVISAO } from "@/lib/financeiro-gerencial/tipos";
import type {
  Baixa,
  CategoriaFinanceira,
  ContaFinanceira,
  ContaFinanceiraComSaldos,
  Lancamento,
  OrigemLancamento,
  Parcela,
  ParcelaManualEntrada,
  Recorrencia,
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

/** Contas financeiras com saldo atual (saldo inicial + baixas realizadas
 * nessa conta) e projetado (saldo atual + saldo em aberto das parcelas
 * atribuídas a ela) - só pro cartão de Conta Financeira, mais caro que
 * `listarContasFinanceiras` (2 queries extras), por isso é uma função à
 * parte em vez de sempre calcular. Parcela sem `conta_financeira_id` (item 5:
 * conta financeira opcional no lançamento) nunca entra na projeção de conta
 * nenhuma - é exatamente por não ter `conta_financeira_id` que ela some do
 * filtro abaixo. */
export async function listarContasFinanceirasComSaldos(unidadeId: string): Promise<ContaFinanceiraComSaldos[]> {
  const supabase = await createClient();
  const contas = await listarContasFinanceiras(unidadeId);
  if (contas.length === 0) return [];

  const [{ data: baixasData }, { data: parcelasAbertasData }] = await Promise.all([
    // Toda baixa realizada, pela conta que o dinheiro de fato usou
    // (`fin_baixas.conta_financeira_id`, escolhida na hora da baixa - pode
    // divergir da conta prevista na parcela) - isso é o saldo atual.
    supabase
      .from("fin_baixas")
      .select("conta_financeira_id, valor, tipo, fin_parcelas!inner(fin_lancamentos!inner(tipo))")
      .eq("unidade_id", unidadeId),
    // Parcelas ainda em aberto/parcial com conta prevista definida - isso
    // vira saldo projetado. Sem conta prevista (item 5: conta financeira
    // opcional) nunca compõe projeção de conta nenhuma.
    supabase
      .from("fin_parcelas")
      .select("id, conta_financeira_id, valor, fin_lancamentos!inner(tipo)")
      .eq("unidade_id", unidadeId)
      .not("conta_financeira_id", "is", null)
      .in("status", ["aberto", "parcial"]),
  ]);

  const saldoAtualPorConta = new Map<string, number>();
  for (const b of (baixasData as
    | { conta_financeira_id: string; valor: number; tipo: TipoBaixa; fin_parcelas: { fin_lancamentos: { tipo: TipoLancamento } } }[]
    | null) ?? []) {
    const sinalTipo = b.fin_parcelas.fin_lancamentos.tipo === "receita" ? 1 : -1;
    const sinalEstorno = b.tipo === "estorno" ? -1 : 1;
    const atual = saldoAtualPorConta.get(b.conta_financeira_id) ?? 0;
    saldoAtualPorConta.set(b.conta_financeira_id, atual + sinalTipo * sinalEstorno * Number(b.valor));
  }

  const idsParcelasAbertas = ((parcelasAbertasData as { id: string }[] | null) ?? []).map((p) => p.id);
  const { data: baixasDasAbertasData } =
    idsParcelasAbertas.length > 0
      ? await supabase.from("fin_baixas").select("parcela_id, valor, tipo").in("parcela_id", idsParcelasAbertas)
      : { data: [] };
  const valorBaixadoPorParcela = new Map<string, number>();
  for (const b of (baixasDasAbertasData as { parcela_id: string; valor: number; tipo: TipoBaixa }[] | null) ?? []) {
    const sinal = b.tipo === "estorno" ? -1 : 1;
    valorBaixadoPorParcela.set(b.parcela_id, (valorBaixadoPorParcela.get(b.parcela_id) ?? 0) + sinal * Number(b.valor));
  }

  const saldoAbertoPorConta = new Map<string, number>();
  for (const p of (parcelasAbertasData as
    | { id: string; conta_financeira_id: string; valor: number; fin_lancamentos: { tipo: TipoLancamento } }[]
    | null) ?? []) {
    const sinalTipo = p.fin_lancamentos.tipo === "receita" ? 1 : -1;
    const saldoAberto = calcularSaldoAberto(Number(p.valor), valorBaixadoPorParcela.get(p.id) ?? 0);
    const atual = saldoAbertoPorConta.get(p.conta_financeira_id) ?? 0;
    saldoAbertoPorConta.set(p.conta_financeira_id, atual + sinalTipo * saldoAberto);
  }

  return contas.map((conta) => {
    const saldoAtual = conta.saldoInicial + (saldoAtualPorConta.get(conta.id) ?? 0);
    const saldoProjetado = saldoAtual + (saldoAbertoPorConta.get(conta.id) ?? 0);
    return { ...conta, saldoAtual, saldoProjetado };
  });
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
    throw new ErroPublico("Não é permitido criar conta nesse grupo de contas.");
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
  origem: OrigemLancamento;
  recorrencia_id: string | null;
  criado_por: string;
  criado_em: string;
  fin_categorias: { nome: string } | null;
};

const COLUNAS_LANCAMENTO =
  "id, tipo, categoria_id, descricao, data_competencia, conta_financeira_id, observacao, origem, recorrencia_id, criado_por, criado_em, fin_categorias(nome)";

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
    origem: row.origem,
    recorrenciaId: row.recorrencia_id,
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
    .select(COLUNAS_LANCAMENTO)
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
    .select(COLUNAS_LANCAMENTO)
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

/** Confere que a categoria existe, é folha lançável (não grupo/subgrupo, não
 * arquivada, não uma das 3 só-de-provisão) e que o tipo bate com o papel_dre
 * dela (só a conta "receita" é receita, todo o resto é sempre despesa) -
 * mesma regra pra lançamento comum e pra recorrência, então vive numa função
 * só. O gatilho `proteger_lancamento_financeiro` repete essa checagem no
 * banco (defesa em profundidade), isto aqui é só pra falhar cedo com
 * mensagem amigável. */
async function validarCategoriaParaLancamento(
  supabase: SupabaseClient,
  unidadeId: string,
  categoriaId: string,
  tipo: TipoLancamento,
): Promise<void> {
  const { data: categoria } = await supabase
    .from("fin_categorias")
    .select("id, nivel, papel_dre, arquivado")
    .eq("unidade_id", unidadeId)
    .eq("id", categoriaId)
    .maybeSingle();
  const categoriaRow = categoria as { id: string; nivel: string; papel_dre: string | null; arquivado: boolean } | null;
  if (
    !categoriaRow ||
    categoriaRow.nivel !== "conta" ||
    categoriaRow.arquivado ||
    (categoriaRow.papel_dre && PAPEIS_DRE_SOMENTE_PROVISAO.includes(categoriaRow.papel_dre as never))
  ) {
    throw new ErroPublico("Conta do Plano de Contas inválida para lançamento manual.");
  }
  const ehCategoriaDeReceita = categoriaRow.papel_dre === "receita";
  if ((tipo === "receita") !== ehCategoriaDeReceita) {
    throw new ErroPublico("Conta do Plano de Contas não corresponde ao tipo do lançamento.");
  }
}

export async function criarLancamento(params: {
  unidadeId: string;
  tipo: TipoLancamento;
  categoriaId: string;
  descricao: string;
  dataCompetencia: string;
  contaFinanceiraId: string | null;
  observacao: string;
  parcelas: ParcelaManualEntrada[];
  criadoPor: string;
}): Promise<Lancamento> {
  const supabase = await createClient();
  await validarCategoriaParaLancamento(supabase, params.unidadeId, params.categoriaId, params.tipo);

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

  const parcelasGeradas = numerarParcelasManuais(params.parcelas);
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

/** Edita os campos do lançamento (Plano de Contas, descrição, competência,
 * conta financeira, observação) - restrito a Gestão/master pela RLS
 * `fin_lancamentos_update_gestao`, não checado de novo aqui. As parcelas
 * nunca mudam por aqui (imutáveis desde a criação, ver
 * `proteger_parcela_financeira`) - corrigir valor/data de parcela é sempre
 * por estorno, não por editar o lançamento. `tipo` também não muda (uma
 * receita não vira despesa depois de criada) - a categoria nova só precisa
 * continuar batendo com o tipo já existente do lançamento. */
export async function editarLancamento(params: {
  unidadeId: string;
  id: string;
  categoriaId: string;
  descricao: string;
  dataCompetencia: string;
  contaFinanceiraId: string | null;
  observacao: string;
}): Promise<Lancamento> {
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("fin_lancamentos")
    .select("tipo")
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.id)
    .maybeSingle();
  const tipo = (existente as { tipo: TipoLancamento } | null)?.tipo;
  if (!tipo) throw new ErroPublico("Lançamento não encontrado.");

  await validarCategoriaParaLancamento(supabase, params.unidadeId, params.categoriaId, tipo);

  const { error } = await supabase
    .from("fin_lancamentos")
    .update({
      categoria_id: params.categoriaId,
      descricao: params.descricao,
      data_competencia: params.dataCompetencia,
      conta_financeira_id: params.contaFinanceiraId,
      observacao: params.observacao,
    })
    .eq("unidade_id", params.unidadeId)
    .eq("id", params.id);
  if (error) throw erroDeNegocio(error);

  const salvo = await obterLancamento(params.unidadeId, params.id);
  if (!salvo) throw new Error("Lançamento editado mas não encontrado na releitura");
  return salvo;
}

// ── Recorrências ─────────────────────────────────────────────────────────

type RecorrenciaRow = {
  id: string;
  tipo: TipoLancamento;
  categoria_id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
  quantidade_ocorrencias: number | null;
  ativa: boolean;
  criado_em: string;
  fin_categorias: { nome: string } | null;
};

function recorrenciaDaLinha(row: RecorrenciaRow): Recorrencia {
  return {
    id: row.id,
    tipo: row.tipo,
    categoriaId: row.categoria_id,
    categoriaNome: row.fin_categorias?.nome ?? "",
    descricao: row.descricao,
    valor: Number(row.valor),
    diaVencimento: row.dia_vencimento,
    dataInicio: row.data_inicio,
    dataFim: row.data_fim,
    quantidadeOcorrencias: row.quantidade_ocorrencias,
    ativa: row.ativa,
    criadoEm: row.criado_em,
  };
}

/** Cria a recorrência e já gera de uma vez todo lançamento/parcela futuro
 * (1 lançamento + 1 parcela por ocorrência, `origem = 'recorrencia'`) - sem
 * job/cron nesta fase, por isso `fim` é sempre obrigatório (nunca "pra
 * sempre", ver `MAXIMO_OCORRENCIAS_RECORRENCIA`). Baixar uma dessas parcelas
 * depois segue `registrarBaixa` normal - como cada ocorrência já nasce como
 * lançamento próprio (sua própria competência), a baixa nunca duplica nada
 * na DRE, só move DFC/caixa. 3 idas ao banco (recorrência, N lançamentos, N
 * parcelas) em vez de N sequenciais - depende da ordem de `RETURNING` num
 * único `INSERT ... VALUES` bater com a ordem de entrada, garantida pelo
 * Postgres pra uma única instrução (nunca inserida linha a linha). */
export async function criarRecorrencia(params: {
  unidadeId: string;
  tipo: TipoLancamento;
  categoriaId: string;
  descricao: string;
  valor: number;
  diaVencimento: number;
  dataInicio: string;
  fim: FimRecorrencia;
  criadoPor: string;
}): Promise<{ recorrencia: Recorrencia; ocorrenciasGeradas: number }> {
  const supabase = await createClient();
  await validarCategoriaParaLancamento(supabase, params.unidadeId, params.categoriaId, params.tipo);

  const datas = gerarOcorrenciasRecorrencia({
    diaVencimento: params.diaVencimento,
    dataInicio: params.dataInicio,
    fim: params.fim,
  });

  const { data: recorrenciaInserida, error: erroRecorrencia } = await supabase
    .from("fin_recorrencias")
    .insert({
      unidade_id: params.unidadeId,
      tipo: params.tipo,
      categoria_id: params.categoriaId,
      descricao: params.descricao,
      valor: params.valor,
      dia_vencimento: params.diaVencimento,
      data_inicio: params.dataInicio,
      data_fim: params.fim.modo === "data" ? params.fim.dataFim : null,
      quantidade_ocorrencias: params.fim.modo === "quantidade" ? params.fim.quantidadeOcorrencias : null,
      criado_por: params.criadoPor,
    })
    .select("id, tipo, categoria_id, descricao, valor, dia_vencimento, data_inicio, data_fim, quantidade_ocorrencias, ativa, criado_em, fin_categorias(nome)")
    .single();
  if (erroRecorrencia || !recorrenciaInserida) {
    throw new Error(erroRecorrencia?.message ?? "Falha ao criar recorrência");
  }

  const { data: lancamentosInseridos, error: erroLancamentos } = await supabase
    .from("fin_lancamentos")
    .insert(
      datas.map((data) => ({
        unidade_id: params.unidadeId,
        tipo: params.tipo,
        categoria_id: params.categoriaId,
        descricao: params.descricao,
        data_competencia: data,
        conta_financeira_id: null,
        observacao: "",
        origem: "recorrencia",
        recorrencia_id: recorrenciaInserida.id,
        criado_por: params.criadoPor,
      })),
    )
    .select("id");
  if (erroLancamentos || !lancamentosInseridos || lancamentosInseridos.length !== datas.length) {
    throw new Error(erroLancamentos?.message ?? "Falha ao criar lançamentos da recorrência");
  }

  const { error: erroParcelas } = await supabase.from("fin_parcelas").insert(
    lancamentosInseridos.map((lancamento, indice) => ({
      unidade_id: params.unidadeId,
      lancamento_id: lancamento.id,
      numero: 1,
      total_parcelas: 1,
      valor: params.valor,
      data_prevista: datas[indice],
      conta_financeira_id: null,
    })),
  );
  if (erroParcelas) throw new Error(erroParcelas.message);

  return {
    recorrencia: recorrenciaDaLinha(recorrenciaInserida as unknown as RecorrenciaRow),
    ocorrenciasGeradas: datas.length,
  };
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
