import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { listarProdutosBanco } from "@/lib/banco/estoque";
import { GRUPOS_FORA_DE_FICHA } from "@/lib/fichas-tecnicas";
import type {
  CamadaFicha,
  CategoriaFicha,
  ComponenteFicha,
  ConfiguracaoFinanceira,
  CustoFicha,
  EtapaFicha,
  FichaTecnica,
  FichaTecnicaResumo,
  StatusFicha,
  UnidadeRendimentoFicha,
} from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CategoriaRow = {
  id: string;
  camada: CamadaFicha;
  codigo: string;
  nome: string;
  ativo: boolean;
};

function categoriaDaLinha(row: CategoriaRow): CategoriaFicha {
  return { id: row.id, camada: row.camada, codigo: row.codigo, nome: row.nome, ativo: row.ativo };
}

export async function listarCategoriasFicha(unidadeId: string): Promise<CategoriaFicha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias_ficha")
    .select("id, camada, codigo, nome, ativo")
    .eq("unidade_id", unidadeId)
    .order("nome");
  if (error) throw new Error(`Não foi possível carregar as categorias: ${error.message}`);
  return ((data as CategoriaRow[] | null) ?? []).map(categoriaDaLinha);
}

/** Só chamado atrás de `requireGestao()` na Server Action. */
export async function criarCategoriaFicha(params: {
  unidadeId: string;
  camada: CamadaFicha;
  codigo: string;
  nome: string;
}): Promise<CategoriaFicha> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias_ficha")
    .insert({ unidade_id: params.unidadeId, camada: params.camada, codigo: params.codigo, nome: params.nome })
    .select("id, camada, codigo, nome, ativo")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Já existe uma categoria com esse código nessa camada");
    throw new Error(error.message);
  }
  return categoriaDaLinha(data as CategoriaRow);
}

async function nomesCategoriasPorId(
  supabase: SupabaseClient,
  unidadeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const idsUnicos = Array.from(new Set(ids));
  if (idsUnicos.length === 0) return new Map();
  const { data } = await supabase
    .from("categorias_ficha")
    .select("id, nome")
    .eq("unidade_id", unidadeId)
    .in("id", idsUnicos);
  const mapa = new Map<string, string>();
  for (const c of (data as { id: string; nome: string }[] | null) ?? []) mapa.set(c.id, c.nome);
  return mapa;
}

async function nomesProdutosPorSku(
  supabase: SupabaseClient,
  unidadeId: string,
  skus: string[],
): Promise<Map<string, string>> {
  const skusUnicos = Array.from(new Set(skus));
  if (skusUnicos.length === 0) return new Map();
  const { data } = await supabase
    .from("produtos")
    .select("sku, nome")
    .eq("unidade_id", unidadeId)
    .in("sku", skusUnicos);
  const mapa = new Map<string, string>();
  for (const p of (data as { sku: string; nome: string }[] | null) ?? []) mapa.set(p.sku, p.nome);
  return mapa;
}

async function nomesFichasPorId(
  supabase: SupabaseClient,
  unidadeId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const idsUnicos = Array.from(new Set(ids));
  if (idsUnicos.length === 0) return new Map();
  const { data } = await supabase
    .from("fichas_tecnicas")
    .select("id, nome")
    .eq("unidade_id", unidadeId)
    .in("id", idsUnicos);
  const mapa = new Map<string, string>();
  for (const f of (data as { id: string; nome: string }[] | null) ?? []) mapa.set(f.id, f.nome);
  return mapa;
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

type FichaRow = {
  id: string;
  categoria_id: string;
  sku: string;
  camada: CamadaFicha;
  nome: string;
  rendimento_quantidade: number;
  rendimento_unidade: UnidadeRendimentoFicha;
  preco_venda: number | null;
  tempo_preparo_minutos: number | null;
  foto_path: string | null;
  observacoes_operacionais: string;
  observacoes_gerenciais: string;
  status: StatusFicha;
  versao: number;
  criado_por: string;
  atualizado_por: string;
  criado_em: string;
  atualizado_em: string;
};

type FichaResumoRow = Pick<
  FichaRow,
  | "id"
  | "categoria_id"
  | "sku"
  | "camada"
  | "nome"
  | "rendimento_quantidade"
  | "rendimento_unidade"
  | "preco_venda"
  | "status"
  | "atualizado_em"
>;

const RESUMO_COLUNAS =
  "id, categoria_id, sku, camada, nome, rendimento_quantidade, rendimento_unidade, preco_venda, status, atualizado_em";

function resumoDaLinha(row: FichaResumoRow, categoriaNome: string, custo: CustoFicha): FichaTecnicaResumo {
  return {
    id: row.id,
    sku: row.sku,
    camada: row.camada,
    categoriaId: row.categoria_id,
    categoriaNome,
    nome: row.nome,
    rendimentoQuantidade: Number(row.rendimento_quantidade),
    precoVenda: row.preco_venda === null ? null : Number(row.preco_venda),
    rendimentoUnidade: row.rendimento_unidade,
    status: row.status,
    custo,
    atualizadoEm: row.atualizado_em,
  };
}

/** Listagem visível a todos os papéis (Operacional inclusive - é quem
 * consulta a ficha no celular durante o preparo). Custo é recalculado por
 * ficha a cada leitura - volume do piloto não justifica cache/coluna. */
export async function listarFichasTecnicas(
  unidadeId: string,
  filtro?: { camada?: CamadaFicha },
): Promise<FichaTecnicaResumo[]> {
  const supabase = await createClient();
  let query = supabase.from("fichas_tecnicas").select(RESUMO_COLUNAS).eq("unidade_id", unidadeId).order("nome");
  if (filtro?.camada) query = query.eq("camada", filtro.camada);

  const { data, error } = await query;
  if (error) throw new Error(`Não foi possível carregar as fichas técnicas: ${error.message}`);
  const linhas = (data as FichaResumoRow[] | null) ?? [];
  if (linhas.length === 0) return [];

  const nomes = await nomesCategoriasPorId(
    supabase,
    unidadeId,
    linhas.map((l) => l.categoria_id),
  );
  return Promise.all(
    linhas.map(async (row) =>
      resumoDaLinha(row, nomes.get(row.categoria_id) ?? "Sem categoria", await calcularCustoFicha(unidadeId, row.id)),
    ),
  );
}

/** Preço já convertido pra unidade que a ficha técnica realmente usa (ex:
 * óleo de soja cadastrado em UND no Estoque, mas usado em LT na receita -
 * `produto_conversoes` guarda quantas unidades de saída cabem em 1 unidade
 * base) e pelo fator de correção (perda de preparo, ex: tomate limpo rende
 * menos peso que o comprado - dimensão separada, se aplica mesmo sem trocar
 * de unidade). Sem conversão cadastrada, os dois fatores ficam em 1
 * (comportamento de hoje: preço do Cadastro direto). */
async function custosUnitariosProdutos(
  supabase: SupabaseClient,
  unidadeId: string,
  skus: string[],
): Promise<Map<string, number | null>> {
  const skusUnicos = Array.from(new Set(skus));
  if (skusUnicos.length === 0) return new Map();
  const [{ data: produtosData }, { data: conversoesData }] = await Promise.all([
    supabase.from("produtos").select("sku, preco_unitario").eq("unidade_id", unidadeId).in("sku", skusUnicos),
    supabase
      .from("produto_conversoes")
      .select("produto_sku, fator_por_unidade_base, fator_correcao")
      .eq("unidade_id", unidadeId)
      .in("produto_sku", skusUnicos),
  ]);
  const conversaoPorSku = new Map<string, { fator: number; fatorCorrecao: number }>();
  for (const c of (conversoesData as { produto_sku: string; fator_por_unidade_base: number; fator_correcao: number }[] | null) ??
    []) {
    conversaoPorSku.set(c.produto_sku, {
      fator: Number(c.fator_por_unidade_base),
      fatorCorrecao: Number(c.fator_correcao),
    });
  }
  const mapa = new Map<string, number | null>();
  for (const p of (produtosData as { sku: string; preco_unitario: number | null }[] | null) ?? []) {
    if (p.preco_unitario === null) {
      mapa.set(p.sku, null);
      continue;
    }
    const conversao = conversaoPorSku.get(p.sku);
    const fator = conversao?.fator ?? 1;
    const fatorCorrecao = conversao?.fatorCorrecao ?? 1;
    mapa.set(p.sku, (Number(p.preco_unitario) / fator) * fatorCorrecao);
  }
  return mapa;
}

const PROFUNDIDADE_MAXIMA_CUSTO = 20;

/** Custo calculado na leitura, nunca guardado em coluna (preço do produto
 * muda com o tempo, custo salvo ficaria velho). Soma o custo de cada
 * componente - preço do Cadastro pro produto, custo por unidade já
 * calculado pra sub-receita (recursivo) - e divide pelo rendimento.
 * `completo=false` sempre que algum componente não tem preço cadastrado
 * ainda, mesmo assim devolve a soma parcial do que dá pra calcular, nunca
 * esconde o problema (mesmo princípio do "cadastro incompleto" em Produtos).
 * Ciclo entre fichas é bloqueado no trigger de escrita - a profundidade
 * máxima aqui é só uma rede de segurança a mais. */
export async function calcularCustoFicha(unidadeId: string, fichaId: string, profundidade = 0): Promise<CustoFicha> {
  const supabase = await createClient();
  if (profundidade >= PROFUNDIDADE_MAXIMA_CUSTO) return { custoTotal: null, custoPorUnidade: null, completo: false };

  const [{ data: fichaRow }, { data: componentesData }] = await Promise.all([
    supabase.from("fichas_tecnicas").select("rendimento_quantidade").eq("unidade_id", unidadeId).eq("id", fichaId).maybeSingle(),
    supabase
      .from("ficha_componentes")
      .select("produto_sku, ficha_componente_id, quantidade")
      .eq("unidade_id", unidadeId)
      .eq("ficha_id", fichaId),
  ]);
  if (!fichaRow) return { custoTotal: null, custoPorUnidade: null, completo: false };

  const componentes =
    (componentesData as { produto_sku: string | null; ficha_componente_id: string | null; quantidade: number }[] | null) ?? [];
  if (componentes.length === 0) return { custoTotal: null, custoPorUnidade: null, completo: false };

  const produtoSkus = componentes.map((c) => c.produto_sku).filter((sku): sku is string => sku !== null);
  const fichaIds = Array.from(
    new Set(componentes.map((c) => c.ficha_componente_id).filter((id): id is string => id !== null)),
  );

  const [precos, custosSubFichasLista] = await Promise.all([
    custosUnitariosProdutos(supabase, unidadeId, produtoSkus),
    Promise.all(fichaIds.map(async (id) => [id, await calcularCustoFicha(unidadeId, id, profundidade + 1)] as const)),
  ]);
  const custosPorFichaId = new Map(custosSubFichasLista);

  let total = 0;
  let completo = true;
  for (const c of componentes) {
    let custoUnitario: number | null;
    if (c.produto_sku) {
      custoUnitario = precos.get(c.produto_sku) ?? null;
      if (custoUnitario === null) completo = false;
    } else {
      const sub = custosPorFichaId.get(c.ficha_componente_id ?? "");
      custoUnitario = sub?.custoPorUnidade ?? null;
      if (custoUnitario === null || !sub?.completo) completo = false;
    }
    if (custoUnitario !== null) total += custoUnitario * Number(c.quantidade);
  }

  const rendimento = Number((fichaRow as { rendimento_quantidade: number }).rendimento_quantidade);
  return {
    custoTotal: total,
    custoPorUnidade: rendimento > 0 ? total / rendimento : null,
    completo,
  };
}

type ComponenteRow = {
  id: string;
  produto_sku: string | null;
  ficha_componente_id: string | null;
  quantidade: number;
  unidade_uso: string;
  ordem: number;
  observacoes: string;
};

type EtapaRow = { ordem: number; descricao: string };

/** Ficha completa (com componentes e etapas resolvidos) - visível a todos os
 * papéis, é a tela que o Operacional abre no celular pra seguir a receita. */
export async function getFichaTecnicaCompleta(unidadeId: string, id: string): Promise<FichaTecnica | null> {
  const supabase = await createClient();
  const { data: fichaRow } = await supabase
    .from("fichas_tecnicas")
    .select("*")
    .eq("unidade_id", unidadeId)
    .eq("id", id)
    .maybeSingle();
  if (!fichaRow) return null;
  const row = fichaRow as FichaRow;

  const [{ data: componentesData }, { data: etapasData }] = await Promise.all([
    supabase
      .from("ficha_componentes")
      .select("id, produto_sku, ficha_componente_id, quantidade, unidade_uso, ordem, observacoes")
      .eq("unidade_id", unidadeId)
      .eq("ficha_id", id)
      .order("ordem"),
    supabase
      .from("ficha_etapas")
      .select("ordem, descricao")
      .eq("unidade_id", unidadeId)
      .eq("ficha_id", id)
      .order("ordem"),
  ]);

  const componentesRows = (componentesData as ComponenteRow[] | null) ?? [];
  const etapasRows = (etapasData as EtapaRow[] | null) ?? [];

  const produtoSkus = componentesRows.map((c) => c.produto_sku).filter((sku): sku is string => sku !== null);
  const fichaIds = componentesRows
    .map((c) => c.ficha_componente_id)
    .filter((fid): fid is string => fid !== null);

  const [nomesProdutos, nomesFichas, nomesCategorias, nomesUsuarios] = await Promise.all([
    nomesProdutosPorSku(supabase, unidadeId, produtoSkus),
    nomesFichasPorId(supabase, unidadeId, fichaIds),
    nomesCategoriasPorId(supabase, unidadeId, [row.categoria_id]),
    nomesPorUserId(supabase, [row.criado_por, row.atualizado_por].filter(Boolean)),
  ]);

  const componentes: ComponenteFicha[] = componentesRows.map((c) => ({
    id: c.id,
    tipo: c.produto_sku ? "produto" : "ficha",
    produtoSku: c.produto_sku,
    fichaComponenteId: c.ficha_componente_id,
    nomeExibicao: c.produto_sku
      ? (nomesProdutos.get(c.produto_sku) ?? c.produto_sku)
      : (nomesFichas.get(c.ficha_componente_id ?? "") ?? "Ficha removida"),
    unidadeUso: c.unidade_uso,
    quantidade: Number(c.quantidade),
    ordem: c.ordem,
    observacoes: c.observacoes,
  }));

  const etapas: EtapaFicha[] = etapasRows.map((e) => ({ ordem: e.ordem, descricao: e.descricao }));
  const custo = await calcularCustoFicha(unidadeId, id);

  return {
    id: row.id,
    sku: row.sku,
    camada: row.camada,
    categoriaId: row.categoria_id,
    categoriaNome: nomesCategorias.get(row.categoria_id) ?? "Sem categoria",
    nome: row.nome,
    rendimentoQuantidade: Number(row.rendimento_quantidade),
    rendimentoUnidade: row.rendimento_unidade,
    precoVenda: row.preco_venda === null ? null : Number(row.preco_venda),
    custo,
    tempoPreparoMinutos: row.tempo_preparo_minutos,
    fotoPath: row.foto_path,
    observacoesOperacionais: row.observacoes_operacionais,
    observacoesGerenciais: row.observacoes_gerenciais,
    status: row.status,
    versao: row.versao,
    componentes,
    etapas,
    criadoPorNome: nomesUsuarios.get(row.criado_por) ?? "Usuário",
    criadoEm: row.criado_em,
    atualizadoPorNome: nomesUsuarios.get(row.atualizado_por) ?? "Usuário",
    atualizadoEm: row.atualizado_em,
  };
}

export type EntradaComponenteFicha = {
  tipo: "produto" | "ficha";
  produtoSku: string | null;
  fichaComponenteId: string | null;
  quantidade: number;
  unidadeUso: string;
  ordem: number;
  observacoes: string;
};

export type EntradaEtapaFicha = { ordem: number; descricao: string };

export type EntradaFichaTecnica = {
  categoriaId: string;
  camada: CamadaFicha;
  nome: string;
  rendimentoQuantidade: number;
  rendimentoUnidade: UnidadeRendimentoFicha;
  /** Só preenchido de verdade quando camada é VEN - PRE sempre manda null
   * (ver comentário em `FichaTecnicaResumo`). */
  precoVenda: number | null;
  tempoPreparoMinutos: number | null;
  fotoPath: string | null;
  observacoesOperacionais: string;
  observacoesGerenciais: string;
  status: StatusFicha;
  componentes: EntradaComponenteFicha[];
  etapas: EntradaEtapaFicha[];
};

/** Todo `raise exception 'texto'` sem errcode explícito nas funções/gatilhos
 * de fichas técnicas (proteger_ficha_tecnica, salvar_ficha_tecnica) sai com
 * SQLSTATE P0001 - são sempre mensagens que eu mesmo escrevi pra explicar
 * pro usuário por que não salvou (nunca vazam detalhe interno), por isso dá
 * pra confiar em qualquer uma delas em vez de manter uma lista de textos
 * fixos que desatualiza sozinha toda vez que a mensagem muda no SQL (bug
 * real: usuário via só "não foi possível salvar" mesmo quando o banco já
 * tinha o motivo certo). Erro de infra (conexão, sintaxe etc.) vem com
 * outro código e cai no fallback genérico normalmente. */
const CODIGO_ERRO_VALIDACAO_SQL = "P0001";

/** Só chamado atrás de `requireGestao()` na Server Action - `unidadeId`
 * sempre resolvido no servidor via `getAcessoAtual()`, nunca aceito do
 * cliente. Delega pra `salvar_ficha_tecnica` no Postgres, que grava ficha +
 * componentes + etapas + versão numa única transação (ver migração
 * 20260811100000_fichas_tecnicas.sql) - RLS de cada tabela continua sendo a
 * barreira que vale de verdade mesmo dentro da função. */
export async function salvarFichaTecnica(params: {
  unidadeId: string;
  fichaId: string | null;
  entrada: EntradaFichaTecnica;
}): Promise<FichaTecnica> {
  const supabase = await createClient();
  const { entrada } = params;

  const { data, error } = await supabase.rpc("salvar_ficha_tecnica", {
    p_unidade_id: params.unidadeId,
    p_ficha_id: params.fichaId,
    p_categoria_id: entrada.categoriaId,
    p_camada: entrada.camada,
    p_nome: entrada.nome,
    p_rendimento_quantidade: entrada.rendimentoQuantidade,
    p_rendimento_unidade: entrada.rendimentoUnidade,
    p_preco_venda: entrada.precoVenda,
    p_tempo_preparo_minutos: entrada.tempoPreparoMinutos,
    p_foto_path: entrada.fotoPath,
    p_observacoes_operacionais: entrada.observacoesOperacionais,
    p_observacoes_gerenciais: entrada.observacoesGerenciais,
    p_status: entrada.status,
    p_componentes: entrada.componentes.map((c) => ({
      produto_sku: c.tipo === "produto" ? c.produtoSku : null,
      ficha_componente_id: c.tipo === "ficha" ? c.fichaComponenteId : null,
      quantidade: c.quantidade,
      unidade_uso: c.unidadeUso,
      ordem: c.ordem,
      observacoes: c.observacoes,
    })),
    p_etapas: entrada.etapas.map((e) => ({ ordem: e.ordem, descricao: e.descricao })),
  });

  if (error) {
    if (error.code === CODIGO_ERRO_VALIDACAO_SQL) throw new ErroPublico(error.message);
    throw new Error(error.message);
  }

  const resultado = data as { id: string } | null;
  if (!resultado?.id) throw new Error("Ficha salva mas sem id de retorno");

  const salva = await getFichaTecnicaCompleta(params.unidadeId, resultado.id);
  if (!salva) throw new Error("Ficha salva mas não encontrada na releitura");
  return salva;
}

/** Só chamado atrás de `requireGestaoFichasTecnicas()` - o trigger de
 * `ficha_componentes` bloqueia (on delete restrict) excluir uma ficha que
 * está em uso como sub-receita de outra, o erro do Postgres é traduzido
 * pra mensagem pública abaixo. */
export async function excluirFichaTecnica(unidadeId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fichas_tecnicas").delete().eq("unidade_id", unidadeId).eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new ErroPublico("Essa ficha está sendo usada como componente de outra ficha - remova essa dependência antes de excluir.");
    }
    throw new Error(error.message);
  }
}

export type OpcaoProdutoFicha = {
  sku: string;
  nome: string;
  unidadeUso: string;
  custoUnitario: number | null;
};

/** Produtos do Estoque prontos pra virar componente de ficha - só ativos,
 * sem os grupos que nunca entram em receita (ver `GRUPOS_FORA_DE_FICHA`),
 * já com a unidade e o custo convertidos via `produto_conversoes` quando
 * existir (ver `listarConversoesProduto`). */
export async function listarProdutosParaFicha(unidadeId: string): Promise<OpcaoProdutoFicha[]> {
  const [produtos, conversoes] = await Promise.all([listarProdutosBanco(unidadeId), listarConversoesProduto(unidadeId)]);
  const conversaoPorSku = new Map(conversoes.map((c) => [c.produtoSku, c]));
  return produtos
    .filter((p) => p.ativo && !GRUPOS_FORA_DE_FICHA.has(p.grupo))
    .map((p) => {
      const conversao = conversaoPorSku.get(p.sku);
      const fator = conversao?.fatorPorUnidadeBase ?? 1;
      const fatorCorrecao = conversao?.fatorCorrecao ?? 1;
      return {
        sku: p.sku,
        nome: p.nome,
        unidadeUso: conversao?.unidadeSaida ?? p.unidadeBase,
        custoUnitario: p.precoUnitario === null ? null : (p.precoUnitario / fator) * fatorCorrecao,
      };
    });
}

export type ConversaoProduto = {
  produtoSku: string;
  unidadeSaida: string;
  fatorPorUnidadeBase: number;
  fatorCorrecao: number;
  descricao: string;
};

export async function listarConversoesProduto(unidadeId: string): Promise<ConversaoProduto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produto_conversoes")
    .select("produto_sku, unidade_saida, fator_por_unidade_base, fator_correcao, descricao")
    .eq("unidade_id", unidadeId);
  if (error) throw new Error(`Não foi possível carregar as conversões: ${error.message}`);
  return (
    (data as
      | { produto_sku: string; unidade_saida: string; fator_por_unidade_base: number; fator_correcao: number; descricao: string }[]
      | null) ?? []
  ).map((r) => ({
    produtoSku: r.produto_sku,
    unidadeSaida: r.unidade_saida,
    fatorPorUnidadeBase: Number(r.fator_por_unidade_base),
    fatorCorrecao: Number(r.fator_correcao),
    descricao: r.descricao,
  }));
}

/** Só chamado atrás de `requireGestaoFichasTecnicas()`. Uma conversão por
 * produto (upsert pela chave unidade+sku): `fatorPorUnidadeBase` é "quantas
 * unidades de saída cabem em 1 unidade base do produto" (ex: óleo de soja,
 * 1 UND = 0,9 LT -> fator 0,9, unidade de saída LT); `fatorCorrecao` é
 * perda de preparo, independente de trocar unidade (ex: tomate perde peso
 * ao limpar - preço efetivo por kg fica maior). */
export async function salvarConversaoProduto(params: {
  unidadeId: string;
  produtoSku: string;
  unidadeSaida: string;
  fatorPorUnidadeBase: number;
  fatorCorrecao: number;
  descricao: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("produto_conversoes").upsert({
    unidade_id: params.unidadeId,
    produto_sku: params.produtoSku,
    unidade_saida: params.unidadeSaida,
    fator_por_unidade_base: params.fatorPorUnidadeBase,
    fator_correcao: params.fatorCorrecao,
    descricao: params.descricao,
  });
  if (error) throw new Error(error.message);
}

/** "Salvar todos" da grade de Conversões - um upsert só com todas as linhas
 * alteradas, mesmo padrão de `salvarProdutosBanco`. */
export async function salvarConversoesProduto(params: {
  unidadeId: string;
  entradas: {
    produtoSku: string;
    unidadeSaida: string;
    fatorPorUnidadeBase: number;
    fatorCorrecao: number;
    descricao: string;
  }[];
}): Promise<void> {
  if (params.entradas.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("produto_conversoes").upsert(
    params.entradas.map((e) => ({
      unidade_id: params.unidadeId,
      produto_sku: e.produtoSku,
      unidade_saida: e.unidadeSaida,
      fator_por_unidade_base: e.fatorPorUnidadeBase,
      fator_correcao: e.fatorCorrecao,
      descricao: e.descricao,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function removerConversaoProduto(unidadeId: string, produtoSku: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("produto_conversoes")
    .delete()
    .eq("unidade_id", unidadeId)
    .eq("produto_sku", produtoSku);
  if (error) throw new Error(error.message);
}

export type FichaTecnicaParaExibir = {
  ficha: FichaTecnica;
  categorias: CategoriaFicha[];
  produtos: OpcaoProdutoFicha[];
  fichasDisponiveis: { id: string; nome: string; sku: string; rendimentoUnidade: UnidadeRendimentoFicha; custoPorUnidade: number | null }[];
};

/** Tudo que a tela de detalhe (rota `/fichas-tecnicas/[id]` ou a janela
 * sobreposta na listagem) precisa pra exibir e, se `podeGerir`, editar em
 * seguida sem outra ida ao banco. Usado tanto pela página quanto pela
 * Server Action que a listagem chama pra abrir a janela sobreposta. */
export async function carregarFichaTecnicaParaExibir(
  unidadeId: string,
  id: string,
  podeGerir: boolean,
): Promise<FichaTecnicaParaExibir | null> {
  const [ficha, categorias, produtos, fichas] = await Promise.all([
    getFichaTecnicaCompleta(unidadeId, id),
    podeGerir ? listarCategoriasFicha(unidadeId) : Promise.resolve([]),
    podeGerir ? listarProdutosParaFicha(unidadeId) : Promise.resolve([]),
    podeGerir ? listarFichasTecnicas(unidadeId) : Promise.resolve([]),
  ]);
  if (!ficha) return null;
  return {
    ficha,
    categorias,
    produtos,
    fichasDisponiveis: fichas.map((f) => ({
      id: f.id,
      nome: f.nome,
      sku: f.sku,
      rendimentoUnidade: f.rendimentoUnidade,
      custoPorUnidade: f.custo.custoPorUnidade,
    })),
  };
}

/** 1 linha por unidade, nasce zerada até a Gestão preencher a primeira vez -
 * sempre existe algo pra devolver (nunca null). */
export async function getConfiguracaoFinanceira(unidadeId: string): Promise<ConfiguracaoFinanceira> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("configuracao_financeira")
    .select("faturamento_medio_mensal, custo_fixo_medio_mensal, lucro_desejado_valor")
    .eq("unidade_id", unidadeId)
    .maybeSingle();
  if (!data) return { faturamentoMedioMensal: 0, custoFixoMedioMensal: 0, lucroDesejadoValor: 0 };
  const row = data as { faturamento_medio_mensal: number; custo_fixo_medio_mensal: number; lucro_desejado_valor: number };
  return {
    faturamentoMedioMensal: Number(row.faturamento_medio_mensal),
    custoFixoMedioMensal: Number(row.custo_fixo_medio_mensal),
    lucroDesejadoValor: Number(row.lucro_desejado_valor),
  };
}

/** Só chamado atrás de `requireGestaoFichasTecnicas()`. */
export async function salvarConfiguracaoFinanceira(unidadeId: string, config: ConfiguracaoFinanceira): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("configuracao_financeira").upsert({
    unidade_id: unidadeId,
    faturamento_medio_mensal: config.faturamentoMedioMensal,
    custo_fixo_medio_mensal: config.custoFixoMedioMensal,
    lucro_desejado_valor: config.lucroDesejadoValor,
  });
  if (error) throw new Error(error.message);
}
