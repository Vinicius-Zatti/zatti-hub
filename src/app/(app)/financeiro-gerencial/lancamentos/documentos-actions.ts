"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceiroGerencial, requireGestaoFinanceiroGerencial, exigirEdicao } from "@/lib/acesso";
import { linkDoOriginal } from "@/lib/banco/caixa-entrada";
import { competenciasFechadas } from "@/lib/banco/financeiro-gerencial-v1";
import { obterLancamento } from "@/lib/banco/financeiro-gerencial";
import type { Lancamento } from "@/lib/financeiro-gerencial/tipos";
import {
  baixarVencimentoDocumento,
  criarContraparte,
  criarDocumento,
  corrigirPagamento,
  editarDocumento,
  obterDocumentoParaEdicao,
  type DocumentoParaEdicao,
  listarContrapartes,
  trocarContraparte,
  type Contraparte,
} from "@/lib/banco/financeiro-documentos";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import {
  baixarVencimentoDocumentoEntradaSchema,
  contraparteEntradaSchema,
  documentoFinanceiroEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";
import type { AcessoAtual } from "@/lib/acesso";

// Financeiro V2 (11/10/2026): nota com vários Plano de Contas e contrapartes. Limites de
// requisição reaproveitam as chaves do Financeiro (a lista global é recriada por outras frentes).

export type ResultadoDocumento = { ok: true; documentoId: string } | { ok: false; mensagem: string };
export type ResultadoContraparte = { ok: true; contraparte: Contraparte } | { ok: false; mensagem: string };

async function garantirMesesAbertos(acesso: AcessoAtual, datas: string[]): Promise<void> {
  if (acesso.role !== "operacional") return;
  const fechadas = await competenciasFechadas(acesso.unidadeId);
  const bloqueada = datas.map((d) => d.slice(0, 7)).find((c) => fechadas.has(c));
  if (bloqueada) {
    const [ano, mes] = bloqueada.split("-");
    throw new ErroPublico(`O mês ${mes}/${ano} está fechado. Só Gestão/master altera lançamentos desse período.`);
  }
}

function revalidarFinanceiro() {
  revalidatePath("/financeiro-gerencial/lancamentos/receitas");
  revalidatePath("/financeiro-gerencial/lancamentos/despesas");
  revalidatePath("/financeiro-gerencial/contas-pagar-receber");
}

export async function criarDocumentoAction(input: unknown): Promise<ResultadoDocumento> {
  const acesso = await requireFinanceiroGerencial();
  try {
    exigirEdicao(acesso, "financeiro");
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const entrada = validarEntrada(documentoFinanceiroEntradaSchema, input);
    await garantirMesesAbertos(acesso, [entrada.dataCompetencia, ...entrada.vencimentos.map((v) => v.dataPrevista)]);
    const documentoId = await criarDocumento({ ...entrada, unidadeId: acesso.unidadeId, origem: "manual" });
    revalidarFinanceiro();
    return { ok: true, documentoId };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o documento.") };
  }
}

export async function baixarVencimentoDocumentoAction(input: unknown): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const acesso = await requireFinanceiroGerencial();
  try {
    exigirEdicao(acesso, "financeiro");
    await exigirLimiteRequisicao("fin_baixa_registrar");
    const entrada = validarEntrada(baixarVencimentoDocumentoEntradaSchema, input);
    await garantirMesesAbertos(acesso, [entrada.data]);
    await baixarVencimentoDocumento({ ...entrada, unidadeId: acesso.unidadeId });
    revalidarFinanceiro();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível registrar o pagamento.") };
  }
}

/** Contas a Pagar e Receber: trocar o fornecedor/cliente de conta já lançada (Gestão/master). */
export async function trocarContraparteAction(input: unknown): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    exigirEdicao(acesso, "financeiro");
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const e = z.object({ lancamentoId: z.string().uuid(), contraparteId: z.string().uuid().nullable() }).strict().parse(input);
    await trocarContraparte(acesso.unidadeId, e.lancamentoId, e.contraparteId);
    revalidatePath("/financeiro-gerencial/contas-pagar-receber");
    revalidatePath("/financeiro-gerencial/lancamentos/despesas");
    revalidatePath("/financeiro-gerencial/lancamentos/receitas");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível trocar o fornecedor.") };
  }
}

/** Editar conta em Contas a Pagar e Receber: carrega o lançamento inteiro para o mesmo formulário
 * de edição da tela Lançamentos (Gestão/master). */
export async function obterLancamentoAction(lancamentoId: string): Promise<{ ok: true; lancamento: Lancamento } | { ok: false; mensagem: string }> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    const l = await obterLancamento(acesso.unidadeId, z.string().uuid().parse(lancamentoId));
    if (!l) return { ok: false, mensagem: "Lançamento não encontrado. Atualize a página." };
    return { ok: true, lancamento: l };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível abrir o lançamento.") };
  }
}

/** Corrigir data e conta de um pagamento (estorna e regrava, mesmo valor). */
export async function corrigirPagamentoAction(input: unknown): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    exigirEdicao(acesso, "financeiro");
    await exigirLimiteRequisicao("fin_lancamento_editar");
    const e = z
      .object({
        baixaIds: z.array(z.string().uuid()).min(1).max(100),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        contaFinanceiraId: z.string().uuid(),
      })
      .strict()
      .parse(input);
    await corrigirPagamento(acesso.unidadeId, e.baixaIds, e.data, e.contaFinanceiraId);
    revalidatePath("/financeiro-gerencial/contas-pagar-receber");
    revalidatePath("/financeiro-gerencial/lancamentos/despesas");
    revalidatePath("/financeiro-gerencial/lancamentos/receitas");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível corrigir o pagamento.") };
  }
}

export async function listarContrapartesAction(): Promise<Contraparte[]> {
  const acesso = await requireFinanceiroGerencial();
  return listarContrapartes(acesso.unidadeId);
}

export async function criarContraparteAction(input: unknown): Promise<ResultadoContraparte> {
  const acesso = await requireFinanceiroGerencial();
  try {
    exigirEdicao(acesso, "financeiro");
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const entrada = validarEntrada(contraparteEntradaSchema, input);
    const contraparte = await criarContraparte({
      ...entrada,
      documento: entrada.documento || null,
      unidadeId: acesso.unidadeId,
      criadoPor: acesso.userId,
    });
    return { ok: true, contraparte };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar o fornecedor ou cliente.") };
  }
}

/** Editar a nota inteira (24/11/2026): carrega a nota lançada para o mesmo formulário da Caixa de
 * Entrada, com os arquivos dela. Gestão/master, como o resto de "Editar conta". */
export async function obterDocumentoParaEdicaoAction(
  documentoId: string,
): Promise<{ ok: true; documento: DocumentoParaEdicao } | { ok: false; mensagem: string }> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    const documento = await obterDocumentoParaEdicao(acesso.unidadeId, z.string().uuid().parse(documentoId));
    if (!documento) return { ok: false, mensagem: "Nota não encontrada. Atualize a página." };
    return { ok: true, documento };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível abrir a nota.") };
  }
}

export async function editarDocumentoAction(input: unknown): Promise<ResultadoDocumento> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    exigirEdicao(acesso, "financeiro");
    await exigirLimiteRequisicao("fin_lancamento_criar");
    const bruto = z.object({ documentoId: z.string().uuid(), documento: z.unknown() }).strict().parse(input);
    const entrada = validarEntrada(documentoFinanceiroEntradaSchema, bruto.documento);
    const documentoId = await editarDocumento(bruto.documentoId, { ...entrada, unidadeId: acesso.unidadeId });
    revalidarFinanceiro();
    return { ok: true, documentoId };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a nota.") };
  }
}

/** Abre um arquivo da nota (XML, PDF ou foto que veio pela Caixa de Entrada). */
export async function linkArquivoDocumentoAction(entradaId: string): Promise<{ ok: true; url: string } | { ok: false; mensagem: string }> {
  const acesso = await requireFinanceiroGerencial();
  try {
    return { ok: true, url: await linkDoOriginal(acesso.unidadeId, z.string().uuid().parse(entradaId)) };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível abrir o arquivo.") };
  }
}
