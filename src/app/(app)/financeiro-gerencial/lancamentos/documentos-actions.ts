"use server";

import { revalidatePath } from "next/cache";
import { requireFinanceiroGerencial } from "@/lib/acesso";
import { competenciasFechadas } from "@/lib/banco/financeiro-gerencial-v1";
import {
  baixarVencimentoDocumento,
  criarContraparte,
  criarDocumento,
  listarContrapartes,
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

export async function listarContrapartesAction(): Promise<Contraparte[]> {
  const acesso = await requireFinanceiroGerencial();
  return listarContrapartes(acesso.unidadeId);
}

export async function criarContraparteAction(input: unknown): Promise<ResultadoContraparte> {
  const acesso = await requireFinanceiroGerencial();
  try {
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
