import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { buscarTudo, buscarTudoEmLotes } from "@/lib/banco/paginacao";
import { assinarEnvelope } from "@/lib/conciliacao/atestado";
import { MODELO_IA_CONCILIACAO, VERSAO_TABELA_PRECOS } from "@/lib/conciliacao/ia-custo";
import type { RegistroUsoIa } from "@/lib/conciliacao/ia-chamada";
import type { CategoriaMotor, RegraMotor } from "@/lib/conciliacao/classificacao";
import type { CandidatoParcela } from "@/lib/conciliacao/candidatos";
import type {
  ConferenciaAritmetica,
  Direcao,
  EstadoMovimento,
  FonteExtracao,
  FormatoArquivo,
  Natureza,
  SituacaoImportacao,
  TipoDocumento,
} from "@/lib/conciliacao/tipos";

// Acesso ao banco da Conciliação. Escrita só pelas RPCs atestadas; leitura
// pela RLS, sempre paginada (sem o teto de 1.000 linhas do PostgREST).

export const BUCKET_CONCILIACAO = "fin-conciliacao";

// Mensagens que o banco levanta de propósito para o usuário.
const MENSAGENS_PUBLICAS: Record<string, string> = {
  "Tentativa expirada ou invalida": "Esta leitura foi substituída por outra tentativa. Atualize a página.",
  "Importacao nao pode ser processada agora": "Esta importação já está sendo processada ou já terminou.",
  "Arquivo ainda nao recebido": "O arquivo ainda não chegou ao armazenamento. Tente enviar de novo.",
  "Sem acesso a Conciliacao desta unidade": "Você não tem acesso à Conciliação desta unidade.",
  "Conta financeira invalida": "Escolha uma conta financeira ativa desta unidade.",
  "IA desligada para esta unidade": "A leitura por IA não está ligada para esta unidade.",
};

function erroDaRpc(error: { code?: string; message: string }): Error {
  const publica = MENSAGENS_PUBLICAS[error.message];
  if (publica) return new ErroPublico(publica);
  // Log técnico só com código (sem payload, sem texto bancário).
  console.error("conciliacao_rpc_falhou", { codigo: error.code ?? null });
  return new Error("conciliacao_rpc_falhou");
}

async function rpcAssinada<T>(funcao: string, operacao: string, usuarioId: string, conteudo: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { envelope, atestado } = assinarEnvelope(operacao, usuarioId, conteudo);
  const { data, error } = await supabase.rpc(funcao, { p_envelope: envelope, p_atestado: atestado });
  if (error) throw erroDaRpc(error);
  return data as T;
}

// ── Flags ──────────────────────────────────────────────────────────────────

export type FlagsConciliacao = { habilitada: boolean; iaDocumentos: boolean; iaClassificacao: boolean };

/** Lida à parte do `getAcessoAtual`: se a migração ainda não estiver no banco,
 * a coluna não existe e a Conciliação fica simplesmente desligada, sem
 * derrubar o resto do app. */
export async function lerFlagsConciliacao(unidadeId: string): Promise<FlagsConciliacao> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("conciliacao_habilitada, conciliacao_ia_documentos, conciliacao_ia_classificacao")
    .eq("id", unidadeId)
    .maybeSingle();
  if (error || !data) return { habilitada: false, iaDocumentos: false, iaClassificacao: false };
  const linha = data as { conciliacao_habilitada: boolean; conciliacao_ia_documentos: boolean; conciliacao_ia_classificacao: boolean };
  return {
    habilitada: linha.conciliacao_habilitada === true,
    iaDocumentos: linha.conciliacao_ia_documentos === true,
    iaClassificacao: linha.conciliacao_ia_classificacao === true,
  };
}

// ── Escrita atestada ───────────────────────────────────────────────────────

export type ResultadoCriacao =
  | { situacao: "aguardando_arquivo"; id: string; caminho: string }
  | { situacao: "duplicada"; id: string; canonica: string; canonica_situacao: SituacaoImportacao }
  | { situacao: "quarentena"; id: string; motivo: string };

export function criarImportacao(usuarioId: string, dados: {
  unidade: string;
  conta: string;
  tipoDocumento: TipoDocumento;
  formato: FormatoArquivo;
  nome: string;
  tamanho: number;
  sha256: string | null;
  mime: string | null;
  quarentenaMotivo: string | null;
  nonce: string;
}): Promise<ResultadoCriacao> {
  return rpcAssinada("fin_conciliacao_criar_importacao", "criar_importacao", usuarioId, {
    unidade: dados.unidade,
    conta: dados.conta,
    tipo_documento: dados.tipoDocumento,
    formato: dados.formato,
    nome: dados.nome,
    tamanho: dados.tamanho,
    sha256: dados.sha256,
    mime: dados.mime,
    quarentena_motivo: dados.quarentenaMotivo,
    nonce: dados.nonce,
  });
}

export function iniciarProcessamento(usuarioId: string, importacao: string, sha256: string): Promise<{ tentativa: number; nonce: string }> {
  return rpcAssinada("fin_conciliacao_iniciar_processamento", "iniciar_processamento", usuarioId, { importacao, sha256 });
}

export function quarentenar(usuarioId: string, dados: { importacao: string; tentativa: number; nonce: string; motivo: string }) {
  return rpcAssinada("fin_conciliacao_quarentenar", "quarentenar", usuarioId, dados);
}

export type ResultadoRegistro = {
  situacao: "concluida" | "parcial" | "falhou";
  motivo?: string | null;
  movimentos_novos?: number;
  possiveis_duplicidades?: number;
  mesmo_identificador?: number;
  conflitos_identificador?: number;
  linhas_com_erro?: number;
  linhas_saldo?: number;
  repetido?: boolean;
};

export function registrarResultado(usuarioId: string, conteudo: Record<string, unknown>): Promise<ResultadoRegistro> {
  return rpcAssinada("fin_conciliacao_registrar_resultado", "registrar_resultado", usuarioId, conteudo);
}

export function registroUsoIa(params: {
  usuarioId: string;
  unidadeId: string;
  importacaoId: string | null;
  finalidade: "extracao_documento" | "classificacao";
}): RegistroUsoIa {
  return {
    iniciar: (chave) =>
      rpcAssinada("fin_conciliacao_ia_iniciar", "ia_iniciar", params.usuarioId, {
        unidade: params.unidadeId,
        importacao: params.importacaoId,
        chave,
        finalidade: params.finalidade,
        modelo: MODELO_IA_CONCILIACAO,
        tabela_precos_versao: VERSAO_TABELA_PRECOS,
      }),
    finalizar: (chave, d) =>
      rpcAssinada("fin_conciliacao_ia_finalizar", "ia_finalizar", params.usuarioId, {
        chave,
        situacao: d.situacao,
        resultado_codigo: d.resultadoCodigo,
        tokens_entrada: d.tokensEntrada,
        tokens_saida: d.tokensSaida,
        tokens_cache_leitura: d.tokensCacheLeitura,
        tokens_cache_escrita: d.tokensCacheEscrita,
        custo_usd: d.custoUsd,
      }),
  };
}

// ── Storage ────────────────────────────────────────────────────────────────

export async function enviarArquivo(caminho: string, bytes: Uint8Array, mime: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET_CONCILIACAO).upload(caminho, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error("conciliacao_upload_falhou");
    throw new ErroPublico("Não foi possível guardar o arquivo. Tente de novo.");
  }
}

export async function baixarArquivo(caminho: string): Promise<Uint8Array> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET_CONCILIACAO).download(caminho);
  if (error || !data) throw new ErroPublico("O arquivo original não está disponível para nova leitura.");
  return new Uint8Array(await data.arrayBuffer());
}

// ── Contexto do motor ──────────────────────────────────────────────────────

export async function carregarContextoMotor(unidadeId: string, organizacaoId: string): Promise<{
  categorias: (CategoriaMotor & { caminho: string })[];
  regras: RegraMotor[];
}> {
  const supabase = await createClient();
  type CatRow = { id: string; parent_id: string | null; nome: string; codigo_sistema: string | null; nivel: string; papel_dre: string | null; arquivado: boolean };
  const cats = await buscarTudo<CatRow>((de, ate) =>
    supabase
      .from("fin_categorias")
      .select("id, parent_id, nome, codigo_sistema, nivel, papel_dre, arquivado")
      .eq("unidade_id", unidadeId)
      .order("id")
      .range(de, ate),
  );
  const porId = new Map(cats.map((c) => [c.id, c]));
  const caminho = (c: CatRow): string => {
    const partes: string[] = [];
    for (let atual: CatRow | undefined = c; atual; atual = atual.parent_id ? porId.get(atual.parent_id) : undefined) {
      partes.unshift(atual.nome);
      if (partes.length > 6) break;
    }
    return partes.join(" > ");
  };
  type RegraRow = {
    id: string;
    escopo: "unidade" | "organizacao";
    padrao_normalizado: string;
    versao_normalizacao: number;
    direcao: Direcao;
    categoria_id: string | null;
    codigo_sistema_alvo: string | null;
    situacao: RegraMotor["situacao"];
    versao: number;
  };
  const colunas = "id, escopo, padrao_normalizado, versao_normalizacao, direcao, categoria_id, codigo_sistema_alvo, situacao, versao";
  const [locais, organizacionais] = await Promise.all([
    buscarTudo<RegraRow>((de, ate) =>
      supabase.from("fin_regras_classificacao").select(colunas).eq("escopo", "unidade").eq("unidade_id", unidadeId)
        .in("situacao", ["ativa", "conflitante"]).order("id").range(de, ate),
    ),
    buscarTudo<RegraRow>((de, ate) =>
      supabase.from("fin_regras_classificacao").select(colunas).eq("escopo", "organizacao").eq("organizacao_id", organizacaoId)
        .in("situacao", ["ativa", "conflitante"]).order("id").range(de, ate),
    ),
  ]);
  return {
    categorias: cats.map((c) => ({
      id: c.id,
      codigoSistema: c.codigo_sistema,
      nivel: c.nivel,
      papelDre: c.papel_dre,
      arquivado: c.arquivado,
      caminho: caminho(c),
    })),
    regras: [...locais, ...organizacionais].map((r) => ({
      id: r.id,
      escopo: r.escopo,
      padraoNormalizado: r.padrao_normalizado,
      versaoNormalizacao: r.versao_normalizacao,
      direcao: r.direcao,
      categoriaId: r.categoria_id,
      codigoSistemaAlvo: r.codigo_sistema_alvo,
      situacao: r.situacao,
      versao: r.versao,
    })),
  };
}

// ── Leituras da tela ──────────────────────────────────────────────────────

export type ImportacaoResumo = {
  id: string;
  contaFinanceiraId: string;
  tipoDocumento: TipoDocumento;
  formato: FormatoArquivo;
  situacao: SituacaoImportacao;
  motivoCodigo: string | null;
  nomeOriginal: string;
  fonteExtracao: FonteExtracao | null;
  conferenciaAritmetica: ConferenciaAritmetica | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  linhasLidas: number;
  movimentosNovos: number;
  mesmoIdentificador: number;
  possiveisDuplicidades: number;
  conflitosIdentificador: number;
  linhasSaldo: number;
  linhasComErro: number;
  movimentosSemConferencia: number;
  erros: { posicao: number; codigo: string }[];
  duplicadaDeId: string | null;
  sha256: string | null;
  caminhoArquivo: string | null;
  arquivoGuardado: boolean;
  criadoEm: string;
};

const COLUNAS_IMPORTACAO =
  "id, conta_financeira_id, tipo_documento, formato, situacao, motivo_codigo, nome_original, fonte_extracao, conferencia_aritmetica, periodo_inicio, periodo_fim, linhas_lidas, movimentos_novos, mesmo_identificador, possiveis_duplicidades, conflitos_identificador, linhas_saldo, linhas_com_erro, movimentos_sem_conferencia, erros, duplicada_de_id, sha256, caminho_arquivo, arquivo_guardado, criado_em";

type ImportacaoRow = {
  id: string;
  conta_financeira_id: string;
  tipo_documento: TipoDocumento;
  formato: FormatoArquivo;
  situacao: SituacaoImportacao;
  motivo_codigo: string | null;
  nome_original: string;
  fonte_extracao: FonteExtracao | null;
  conferencia_aritmetica: ConferenciaAritmetica | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  linhas_lidas: number;
  movimentos_novos: number;
  mesmo_identificador: number;
  possiveis_duplicidades: number;
  conflitos_identificador: number;
  linhas_saldo: number;
  linhas_com_erro: number;
  movimentos_sem_conferencia: number;
  erros: { posicao: number; codigo: string }[];
  duplicada_de_id: string | null;
  sha256: string | null;
  caminho_arquivo: string | null;
  arquivo_guardado: boolean;
  criado_em: string;
};

function importacaoDaLinha(r: ImportacaoRow): ImportacaoResumo {
  return {
    id: r.id,
    contaFinanceiraId: r.conta_financeira_id,
    tipoDocumento: r.tipo_documento,
    formato: r.formato,
    situacao: r.situacao,
    motivoCodigo: r.motivo_codigo,
    nomeOriginal: r.nome_original,
    fonteExtracao: r.fonte_extracao,
    conferenciaAritmetica: r.conferencia_aritmetica,
    periodoInicio: r.periodo_inicio,
    periodoFim: r.periodo_fim,
    linhasLidas: r.linhas_lidas,
    movimentosNovos: r.movimentos_novos,
    mesmoIdentificador: r.mesmo_identificador,
    possiveisDuplicidades: r.possiveis_duplicidades,
    conflitosIdentificador: r.conflitos_identificador,
    linhasSaldo: r.linhas_saldo,
    linhasComErro: r.linhas_com_erro,
    movimentosSemConferencia: r.movimentos_sem_conferencia,
    erros: Array.isArray(r.erros) ? r.erros : [],
    duplicadaDeId: r.duplicada_de_id,
    sha256: r.sha256,
    caminhoArquivo: r.caminho_arquivo,
    arquivoGuardado: r.arquivo_guardado,
    criadoEm: r.criado_em,
  };
}

export const IMPORTACOES_POR_PAGINA = 20;

export async function listarImportacoes(unidadeId: string, pagina: number): Promise<{ itens: ImportacaoResumo[]; total: number }> {
  const supabase = await createClient();
  const de = Math.max(0, pagina - 1) * IMPORTACOES_POR_PAGINA;
  const { data, error, count } = await supabase
    .from("fin_importacoes")
    .select(COLUNAS_IMPORTACAO, { count: "exact" })
    .eq("unidade_id", unidadeId)
    .order("criado_em", { ascending: false })
    .order("id")
    .range(de, de + IMPORTACOES_POR_PAGINA - 1);
  if (error) throw new Error("conciliacao_leitura_importacoes");
  return { itens: ((data as ImportacaoRow[] | null) ?? []).map(importacaoDaLinha), total: count ?? 0 };
}

export async function obterImportacao(unidadeId: string, id: string): Promise<ImportacaoResumo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_importacoes").select(COLUNAS_IMPORTACAO).eq("unidade_id", unidadeId).eq("id", id).maybeSingle();
  if (error) throw new Error("conciliacao_leitura_importacao");
  return data ? importacaoDaLinha(data as ImportacaoRow) : null;
}

export type ItemFila = {
  id: string;
  contaFinanceiraId: string;
  importacaoOrigemId: string;
  data: string;
  direcao: Direcao;
  valor: number;
  descricaoOriginal: string;
  natureza: Natureza;
  estado: EstadoMovimento;
  motivoRevisao: string | null;
  duplicidadeCandidataId: string | null;
  fonteExtracao: FonteExtracao;
  sugestao: {
    categoriaId: string | null;
    confianca: string;
    fonte: string;
    motivoCodigo: string;
    modeloIa: string | null;
  } | null;
};

export type FiltrosFila = { estado: "todos" | "pendente" | "revisar"; importacaoId: string | null; direcao: "todas" | Direcao };
export const ITENS_FILA_POR_PAGINA = 100;

export async function listarFila(unidadeId: string, filtros: FiltrosFila, pagina: number): Promise<{ itens: ItemFila[]; total: number }> {
  const supabase = await createClient();
  const de = Math.max(0, pagina - 1) * ITENS_FILA_POR_PAGINA;
  let consulta = supabase
    .from("fin_movimentos_importados")
    .select(
      "id, conta_financeira_id, importacao_origem_id, data, direcao, valor, descricao_original, natureza, estado, motivo_revisao, duplicidade_candidata_id, fonte_extracao",
      { count: "exact" },
    )
    .eq("unidade_id", unidadeId);
  if (filtros.estado !== "todos") consulta = consulta.eq("estado", filtros.estado);
  else consulta = consulta.in("estado", ["pendente", "revisar"]);
  if (filtros.importacaoId) consulta = consulta.eq("importacao_origem_id", filtros.importacaoId);
  if (filtros.direcao !== "todas") consulta = consulta.eq("direcao", filtros.direcao);
  const { data, error, count } = await consulta
    .order("data", { ascending: false })
    .order("id")
    .range(de, de + ITENS_FILA_POR_PAGINA - 1);
  if (error) throw new Error("conciliacao_leitura_fila");
  type MovRow = {
    id: string;
    conta_financeira_id: string;
    importacao_origem_id: string;
    data: string;
    direcao: Direcao;
    valor: number | string;
    descricao_original: string;
    natureza: Natureza;
    estado: EstadoMovimento;
    motivo_revisao: string | null;
    duplicidade_candidata_id: string | null;
    fonte_extracao: FonteExtracao;
  };
  const linhas = (data as MovRow[] | null) ?? [];
  type SugRow = { movimento_id: string; categoria_sugerida_id: string | null; confianca: string; fonte: string; motivo_codigo: string; modelo_ia: string | null };
  const sugestoes = await buscarTudoEmLotes<SugRow>(
    linhas.map((l) => l.id),
    (lote, a, b) =>
      supabase
        .from("fin_classificacoes")
        .select("movimento_id, categoria_sugerida_id, confianca, fonte, motivo_codigo, modelo_ia")
        .eq("situacao", "vigente")
        .in("movimento_id", lote)
        .order("id")
        .range(a, b),
  );
  const porMov = new Map(sugestoes.map((s) => [s.movimento_id, s]));
  return {
    total: count ?? 0,
    itens: linhas.map((l) => {
      const s = porMov.get(l.id);
      return {
        id: l.id,
        contaFinanceiraId: l.conta_financeira_id,
        importacaoOrigemId: l.importacao_origem_id,
        data: l.data,
        direcao: l.direcao,
        valor: Number(l.valor),
        descricaoOriginal: l.descricao_original,
        natureza: l.natureza,
        estado: l.estado,
        motivoRevisao: l.motivo_revisao,
        duplicidadeCandidataId: l.duplicidade_candidata_id,
        fonteExtracao: l.fonte_extracao,
        sugestao: s
          ? { categoriaId: s.categoria_sugerida_id, confianca: s.confianca, fonte: s.fonte, motivoCodigo: s.motivo_codigo, modeloIa: s.modelo_ia }
          : null,
      };
    }),
  };
}

export const CANDIDATOS_POR_PAGINA = 20;

export async function listarCandidatos(
  movimentoId: string,
  opcoes: { foraDaJanela: boolean; pagina: number },
): Promise<{ itens: CandidatoParcela[]; temMais: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_conciliacao_candidatos_parcela", {
    p_movimento: movimentoId,
    p_janela_dias: 5,
    p_fora_da_janela: opcoes.foraDaJanela,
    p_offset: Math.max(0, opcoes.pagina - 1) * CANDIDATOS_POR_PAGINA,
    p_limite: CANDIDATOS_POR_PAGINA,
  });
  if (error) throw erroDaRpc(error);
  type Row = {
    grupo: "aberta" | "quitada";
    parcela_id: string;
    lancamento_id: string;
    descricao: string;
    categoria_nome: string;
    data_prevista: string;
    valor: number | string;
    saldo_aberto: number | string;
    status: string;
    numero: number;
    total_parcelas: number;
    conta_financeira_id: string | null;
  };
  const linhas = (data as Row[] | null) ?? [];
  return {
    temMais: linhas.length > CANDIDATOS_POR_PAGINA,
    itens: linhas.slice(0, CANDIDATOS_POR_PAGINA).map((r) => ({
      grupo: r.grupo,
      parcelaId: r.parcela_id,
      lancamentoId: r.lancamento_id,
      descricao: r.descricao,
      categoriaNome: r.categoria_nome,
      dataPrevista: r.data_prevista,
      valor: Number(r.valor),
      saldoAberto: Number(r.saldo_aberto),
      status: r.status,
      numero: r.numero,
      totalParcelas: r.total_parcelas,
      contaFinanceiraId: r.conta_financeira_id,
    })),
  };
}

// ── Uso de IA (tela do master) ─────────────────────────────────────────────

export type ChamadaIa = {
  unidadeId: string;
  finalidade: string;
  situacao: string;
  custoUsd: number | null;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  iniciadaEm: string;
};

export async function listarUsoIa(desdeIso: string): Promise<ChamadaIa[]> {
  const supabase = await createClient();
  type Row = {
    unidade_id: string;
    finalidade: string;
    situacao: string;
    custo_estimado_usd: number | string | null;
    tokens_entrada: number | null;
    tokens_saida: number | null;
    iniciada_em: string;
  };
  const linhas = await buscarTudo<Row>((de, ate) =>
    supabase
      .from("fin_ia_chamadas")
      .select("unidade_id, finalidade, situacao, custo_estimado_usd, tokens_entrada, tokens_saida, iniciada_em")
      .gte("iniciada_em", desdeIso)
      .order("iniciada_em")
      .order("id")
      .range(de, ate),
  );
  return linhas.map((r) => ({
    unidadeId: r.unidade_id,
    finalidade: r.finalidade,
    situacao: r.situacao,
    custoUsd: r.custo_estimado_usd === null ? null : Number(r.custo_estimado_usd),
    tokensEntrada: r.tokens_entrada,
    tokensSaida: r.tokens_saida,
    iniciadaEm: r.iniciada_em,
  }));
}
