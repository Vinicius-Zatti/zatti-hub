import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { ErroPublico } from "@/lib/erros";
import { buscarTudo } from "@/lib/banco/paginacao";
import { erroDeNegocio } from "@/lib/banco/financeiro-gerencial";
import { ratearDocumento } from "@/lib/financeiro-gerencial/rateio";
import type { TipoLancamento } from "@/lib/financeiro-gerencial/tipos";

// Financeiro V2 (11/10/2026): contrapartes e documento com rateio em vários Plano de Contas.
// A gravação é uma RPC só (`fin_documento_criar`, security invoker): RLS e gatilhos do usuário
// valem e nada fica pela metade.

export type TipoContraparte = "fornecedor" | "cliente" | "ambos";

export type Contraparte = {
  id: string;
  nome: string;
  documento: string | null;
  tipo: TipoContraparte;
};

export type OrigemDocumento = "manual" | "conciliacao" | "caixa_entrada" | "importacao_planilha";

export type LinhaDocumentoEntrada = { categoriaId: string; descricao: string; valorCentavos: number };
export type VencimentoDocumentoEntrada = { dataPrevista: string; valorCentavos: number };

export type DocumentoEntrada = {
  unidadeId: string;
  chave: string;
  tipo: TipoLancamento;
  contraparteId: string | null;
  numero: string;
  descricao: string;
  dataEmissao: string | null;
  dataCompetencia: string;
  contaFinanceiraId: string | null;
  observacao: string;
  origem: OrigemDocumento;
  linhas: LinhaDocumentoEntrada[];
  vencimentos: VencimentoDocumentoEntrada[];
};

/** Só dígitos; aceita 11 (CPF) ou 14 (CNPJ). Vazio vira null. */
export function normalizarDocumentoPessoa(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length === 0) return null;
  if (digitos.length !== 11 && digitos.length !== 14) {
    throw new ErroPublico("CPF precisa ter 11 dígitos e CNPJ 14.");
  }
  return digitos;
}

export async function listarContrapartes(unidadeId: string): Promise<Contraparte[]> {
  const supabase = await createClient();
  const linhas = await buscarTudo<{ id: string; nome: string; documento: string | null; tipo: TipoContraparte }>(
    (de, ate) =>
      supabase
        .from("fin_contrapartes")
        .select("id, nome, documento, tipo")
        .eq("unidade_id", unidadeId)
        .eq("ativo", true)
        .order("nome")
        .order("id")
        .range(de, ate),
  );
  return linhas;
}

export async function criarContraparte(params: {
  unidadeId: string;
  nome: string;
  documento: string | null;
  tipo: TipoContraparte;
  criadoPor: string;
}): Promise<Contraparte> {
  const supabase = await createClient();
  const documento = normalizarDocumentoPessoa(params.documento);
  if (documento) {
    const { data: existente } = await supabase
      .from("fin_contrapartes")
      .select("id, nome, documento, tipo")
      .eq("unidade_id", params.unidadeId)
      .eq("documento", documento)
      .maybeSingle();
    if (existente) return existente as Contraparte;
  }
  const { data, error } = await supabase
    .from("fin_contrapartes")
    .insert({
      unidade_id: params.unidadeId,
      nome: params.nome.trim(),
      documento,
      tipo: params.tipo,
      criado_por: params.criadoPor,
    })
    .select("id, nome, documento, tipo")
    .single();
  if (error || !data) {
    if (error) throw erroDeNegocio(error);
    throw new Error("Falha ao criar contraparte");
  }
  return data as Contraparte;
}

/** Monta o payload da RPC com o rateio já fechado ao centavo. Exportada para teste. */
export function montarPayloadDocumento(entrada: DocumentoEntrada) {
  if (entrada.linhas.length === 0) throw new ErroPublico("Informe pelo menos uma linha de Plano de Contas.");
  if (entrada.vencimentos.length === 0) throw new ErroPublico("Informe pelo menos um vencimento.");
  const totalLinhas = entrada.linhas.reduce((a, l) => a + l.valorCentavos, 0);
  const totalVencimentos = entrada.vencimentos.reduce((a, v) => a + v.valorCentavos, 0);
  if (totalLinhas !== totalVencimentos) {
    throw new ErroPublico("A soma das linhas precisa ser igual à soma dos vencimentos.");
  }
  const matriz = ratearDocumento(
    entrada.linhas.map((l) => l.valorCentavos),
    entrada.vencimentos.map((v) => v.valorCentavos),
  );
  const conteudo = {
    tipo: entrada.tipo,
    contraparte_id: entrada.contraparteId,
    numero: entrada.numero.trim(),
    descricao: entrada.descricao.trim(),
    data_emissao: entrada.dataEmissao,
    data_competencia: entrada.dataCompetencia,
    conta_financeira_id: entrada.contaFinanceiraId,
    observacao: entrada.observacao,
    origem: entrada.origem,
    vencimentos: entrada.vencimentos.map((v) => v.dataPrevista),
    linhas: entrada.linhas.map((l, i) => ({
      categoria_id: l.categoriaId,
      descricao: l.descricao.trim(),
      valor: l.valorCentavos,
      celulas: matriz[i],
    })),
  };
  const digest = createHash("sha256").update(JSON.stringify(conteudo), "utf8").digest("hex");
  return { unidade: entrada.unidadeId, chave: entrada.chave, digest, ...conteudo };
}

export async function criarDocumento(entrada: DocumentoEntrada): Promise<string> {
  const supabase = await createClient();
  const payload = montarPayloadDocumento(entrada);
  const { data, error } = await supabase.rpc("fin_documento_criar", { p: payload });
  if (error) {
    if (error.code === "23505") {
      throw new ErroPublico("Este documento já foi salvo com outro conteúdo. Recarregue a tela e confira.");
    }
    throw erroDeNegocio(error);
  }
  return data as string;
}

export async function baixarVencimentoDocumento(params: {
  unidadeId: string;
  documentoId: string;
  vencimento: number;
  contaFinanceiraId: string;
  data: string;
  valorCentavos: number;
  observacao: string;
}): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_documento_baixar", {
    p: {
      unidade: params.unidadeId,
      documento_id: params.documentoId,
      vencimento: params.vencimento,
      conta_financeira_id: params.contaFinanceiraId,
      data: params.data,
      valor: params.valorCentavos,
      observacao: params.observacao,
    },
  });
  if (error) throw erroDeNegocio(error);
  return data as number;
}
