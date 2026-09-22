"use server";

import { revalidatePath } from "next/cache";
import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { listarCategorias } from "@/lib/banco/financeiro-gerencial";
import {
  carregarBaseFinanceira,
  criarReversaoProvisao,
  excluirReversaoProvisao,
  listarParametrosProvisao,
  listarReversoesProvisao,
  salvarParametrosProvisao,
} from "@/lib/banco/financeiro-gerencial-v1";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { calcularProvisoes, saldoProvisaoAte } from "@/lib/financeiro-gerencial/provisoes";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import {
  excluirReversaoProvisaoEntradaSchema,
  parametrosProvisaoEntradaSchema,
  reversaoProvisaoEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";

export type ResultadoProvisao = { ok: true } | { ok: false; mensagem: string };

// Provisões mexem na DRE (CMO) - revalida as duas telas.
function revalidar() {
  revalidatePath("/financeiro-gerencial/provisoes");
  revalidatePath("/financeiro-gerencial/dre");
  revalidatePath("/financeiro-gerencial/dfc");
}

// Parâmetro novo = linha nova (histórico); nunca edita a anterior.
export async function salvarParametrosProvisaoAction(input: unknown): Promise<ResultadoProvisao> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_provisao_parametros_salvar");
    const entrada = validarEntrada(parametrosProvisaoEntradaSchema, input);
    await salvarParametrosProvisao({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar os parâmetros.") };
  }
}

// Reversão nunca maior que o saldo provisionado do balde naquele mês.
export async function criarReversaoProvisaoAction(input: unknown): Promise<ResultadoProvisao> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_provisao_reversao_salvar");
    const entrada = validarEntrada(reversaoProvisaoEntradaSchema, input);
    const [{ lancamentos }, categorias, parametros, reversoes] = await Promise.all([
      carregarBaseFinanceira(acesso.unidadeId),
      listarCategorias(acesso.unidadeId),
      listarParametrosProvisao(acesso.unidadeId),
      listarReversoesProvisao(acesso.unidadeId),
    ]);
    const provisoes = calcularProvisoes({ lancamentos, categorias, parametros, reversoes, ateCompetencia: entrada.competencia });
    const saldo = saldoProvisaoAte(provisoes, entrada.tipo, entrada.competencia);
    if (entrada.valor > saldo + 0.005) {
      throw new ErroPublico(`Reversão maior que o saldo provisionado no mês (R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`);
    }
    await criarReversaoProvisao({ ...entrada, unidadeId: acesso.unidadeId, criadoPor: acesso.userId });
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível registrar a reversão.") };
  }
}

export async function excluirReversaoProvisaoAction(input: unknown): Promise<ResultadoProvisao> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_provisao_reversao_salvar");
    const entrada = validarEntrada(excluirReversaoProvisaoEntradaSchema, input);
    await excluirReversaoProvisao({ ...entrada, unidadeId: acesso.unidadeId });
    revalidar();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir a reversão.") };
  }
}
