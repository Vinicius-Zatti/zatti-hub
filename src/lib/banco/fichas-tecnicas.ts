import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import type {
  CamadaFicha,
  CategoriaFicha,
  ComponenteFicha,
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
  "id" | "categoria_id" | "sku" | "camada" | "nome" | "rendimento_quantidade" | "rendimento_unidade" | "preco_venda" | "status" | "atualizado_em"
>;

const RESUMO_COLUNAS =
  "id, categoria_id, sku, camada, nome, rendimento_quantidade, rendimento_unidade, preco_venda, status, atualizado_em";

function resumoDaLinha(row: FichaResumoRow, categoriaNome: string): FichaTecnicaResumo {
  return {
    id: row.id,
    sku: row.sku,
    camada: row.camada,
    categoriaId: row.categoria_id,
    categoriaNome,
    nome: row.nome,
    rendimentoQuantidade: Number(row.rendimento_quantidade),
    rendimentoUnidade: row.rendimento_unidade,
    precoVenda: row.preco_venda === null ? null : Number(row.preco_venda),
    status: row.status,
    atualizadoEm: row.atualizado_em,
  };
}

/** Listagem visível a todos os papéis (Operacional inclusive - é quem
 * consulta a ficha no celular durante o preparo). */
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
  return linhas.map((row) => resumoDaLinha(row, nomes.get(row.categoria_id) ?? "Sem categoria"));
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
  precoVenda: number | null;
  tempoPreparoMinutos: number | null;
  fotoPath: string | null;
  observacoesOperacionais: string;
  observacoesGerenciais: string;
  status: StatusFicha;
  componentes: EntradaComponenteFicha[];
  etapas: EntradaEtapaFicha[];
};

const MENSAGENS_PUBLICAS_RPC = new Set([
  "Ficha tecnica nao encontrada",
  "Sem permissao para editar esta ficha tecnica",
  "Categoria e camada nao correspondem a ficha",
  "SKU ja usado por um produto do estoque",
]);

/** Só chamado atrás de `requireGestao()` na Server Action - `unidadeId`
 * sempre resolvido no servidor via `getAcessoAtual()`, nunca aceito do
 * cliente. Delega pra `salvar_ficha_tecnica` no Postgres, que grava ficha +
 * componentes + etapas + versão numa única transação (ver migração
 * 20260811_z_fichas_tecnicas.sql) - RLS de cada tabela continua sendo a
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
    if (MENSAGENS_PUBLICAS_RPC.has(error.message)) throw new ErroPublico(error.message);
    throw new Error(error.message);
  }

  const resultado = data as { id: string } | null;
  if (!resultado?.id) throw new Error("Ficha salva mas sem id de retorno");

  const salva = await getFichaTecnicaCompleta(params.unidadeId, resultado.id);
  if (!salva) throw new Error("Ficha salva mas não encontrada na releitura");
  return salva;
}
