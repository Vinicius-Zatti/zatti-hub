import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErroPublico } from "@/lib/erros";
import { buscarTudo } from "@/lib/banco/paginacao";
import { erroDeNegocio } from "@/lib/banco/financeiro-gerencial";
import { montarPayloadDocumento, type DocumentoEntrada } from "@/lib/banco/financeiro-documentos";
import { BUCKET_CAIXA_ENTRADA } from "@/lib/caixa-entrada/processar";
import type { ExtracaoDocumento, Sugestao } from "@/lib/caixa-entrada/extracao";

// Caixa de Entrada (Financeiro V2): leituras pela sessão (RLS) e ações pelas RPCs.

export type SituacaoEntrada = "recebido" | "lendo" | "lido" | "falhou" | "lancado" | "anexado" | "descartado";

export type EntradaCaixa = {
  id: string;
  canal: "upload" | "whatsapp" | "drive";
  remetente: string | null;
  nomeArquivo: string;
  mime: string;
  situacao: SituacaoEntrada;
  erroCodigo: string | null;
  extracao: (ExtracaoDocumento & { sugestao: Sugestao; contraparteId: string | null }) | null;
  documentoId: string | null;
  lancamentoId: string | null;
  descarteMotivo: string | null;
  recebidoEm: string;
};

export async function listarEntradas(unidadeId: string, filtro: "pendentes" | "tratadas"): Promise<EntradaCaixa[]> {
  const supabase = await createClient();
  const situacoes = filtro === "pendentes" ? ["recebido", "lendo", "lido", "falhou"] : ["lancado", "anexado", "descartado"];
  type Row = {
    id: string;
    canal: EntradaCaixa["canal"];
    remetente: string | null;
    nome_arquivo: string;
    mime: string;
    situacao: SituacaoEntrada;
    erro_codigo: string | null;
    extracao: EntradaCaixa["extracao"];
    documento_id: string | null;
    lancamento_id: string | null;
    descarte_motivo: string | null;
    recebido_em: string;
  };
  const linhas = await buscarTudo<Row>((de, ate) =>
    supabase
      .from("fin_caixa_entrada")
      .select("id, canal, remetente, nome_arquivo, mime, situacao, erro_codigo, extracao, documento_id, lancamento_id, descarte_motivo, recebido_em")
      .eq("unidade_id", unidadeId)
      .in("situacao", situacoes)
      .order("recebido_em", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  return linhas.map((r) => ({
    id: r.id,
    canal: r.canal,
    remetente: r.remetente,
    nomeArquivo: r.nome_arquivo,
    mime: r.mime,
    situacao: r.situacao,
    erroCodigo: r.erro_codigo,
    extracao: r.extracao,
    documentoId: r.documento_id,
    lancamentoId: r.lancamento_id,
    descarteMotivo: r.descarte_motivo,
    recebidoEm: r.recebido_em,
  }));
}

/** Link temporário (5 min) para ver o original. Confere antes, pela sessão, que a entrada é da unidade. */
export async function linkDoOriginal(unidadeId: string, entradaId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_caixa_entrada")
    .select("caminho_arquivo")
    .eq("unidade_id", unidadeId)
    .eq("id", entradaId)
    .maybeSingle();
  const caminho = (data as { caminho_arquivo: string } | null)?.caminho_arquivo;
  if (!caminho) throw new ErroPublico("Documento não encontrado.");
  const { data: assinado, error } = await createAdminClient().storage.from(BUCKET_CAIXA_ENTRADA).createSignedUrl(caminho, 300);
  if (error || !assinado) throw new ErroPublico("Não foi possível abrir o arquivo agora.");
  return assinado.signedUrl;
}

export async function lancarEntrada(entradaId: string, documento: DocumentoEntrada): Promise<string> {
  const supabase = await createClient();
  const payload = montarPayloadDocumento({ ...documento, origem: "caixa_entrada" });
  const { unidade: _unidade, ...semUnidade } = payload;
  void _unidade;
  const { data, error } = await supabase.rpc("fin_caixa_entrada_lancar", { p_entrada: entradaId, p_documento: semUnidade });
  if (error) {
    if (error.code === "P0001") throw new ErroPublico("Este documento já foi tratado por outra pessoa. Atualize a página.");
    if (error.code === "23505") throw new ErroPublico("Este documento já foi salvo com outro conteúdo. Atualize a página.");
    throw erroDeNegocio(error);
  }
  return data as string;
}

export async function tratarEntrada(entradaId: string, acao: "anexar" | "descartar", lancamentoId: string | null, motivo: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_caixa_entrada_tratar", {
    p_entrada: entradaId,
    p_acao: acao,
    p_lancamento: lancamentoId,
    p_motivo: motivo,
  });
  if (error) {
    if (error.code === "P0001") throw new ErroPublico("Este documento já foi tratado por outra pessoa. Atualize a página.");
    throw erroDeNegocio(error);
  }
}

export type ConfigCaixa = {
  remetentes: { id: string; telefone: string; nome: string }[];
  pasta: { situacao: "solicitada" | "ativa" | "desligada"; link: string | null; emailCompartilhar: string | null } | null;
};

export async function lerConfigCaixa(unidadeId: string): Promise<ConfigCaixa> {
  const supabase = await createClient();
  const [rem, pasta] = await Promise.all([
    supabase.from("fin_caixa_entrada_remetentes").select("id, telefone, nome").eq("unidade_id", unidadeId).eq("ativo", true).order("nome"),
    supabase.from("fin_caixa_entrada_pastas").select("situacao, link, email_compartilhar").eq("unidade_id", unidadeId).maybeSingle(),
  ]);
  const p = pasta.data as { situacao: "solicitada" | "ativa" | "desligada"; link: string | null; email_compartilhar: string | null } | null;
  return {
    remetentes: (rem.data as ConfigCaixa["remetentes"] | null) ?? [],
    pasta: p ? { situacao: p.situacao, link: p.link, emailCompartilhar: p.email_compartilhar } : null,
  };
}

export async function configurarCaixa(unidadeId: string, config: Record<string, unknown>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_caixa_entrada_configurar", { p_unidade: unidadeId, p_config: config });
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Este número já está cadastrado em uma unidade.");
    throw erroDeNegocio(error);
  }
}

export type DestinatarioAlerta = { id: string; telefone: string; nome: string };

export async function listarDestinatariosAlerta(unidadeId: string): Promise<DestinatarioAlerta[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_alerta_destinatarios")
    .select("id, telefone, nome")
    .eq("unidade_id", unidadeId)
    .eq("ativo", true)
    .order("nome");
  return (data as DestinatarioAlerta[] | null) ?? [];
}

export async function configurarAlerta(unidadeId: string, config: Record<string, unknown>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_alerta_configurar", { p_unidade: unidadeId, p_config: config });
  if (error) {
    if (error.code === "23505") throw new ErroPublico("Este número já recebe o alerta desta unidade.");
    throw erroDeNegocio(error);
  }
}
