"use server";

import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { salvarEstoqueMensal, salvarSaidaSemReceita } from "@/lib/banco/financeiro-gerencial";
import { estoqueMensalEntradaSchema, saidaSemReceitaEntradaSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { revalidatePath } from "next/cache";
import type { EstoqueMensal, SaidaSemReceita } from "@/lib/financeiro-gerencial/tipos";

// Sem `registrarAuditoria()` aqui - o gatilho `auditar_escrita_financeiro_gerencial`
// (migrações `20260825170000_...sql` e `20260826090000_...sql`) grava o log
// direto no banco pra qualquer INSERT/UPDATE em `fin_estoque_mensal`/`fin_saidas_sem_receita`.
export type ResultadoEstoqueMensal = { ok: true; estoque: EstoqueMensal } | { ok: false; mensagem: string };
export type ResultadoSaidaSemReceita = { ok: true; saida: SaidaSemReceita } | { ok: false; mensagem: string };

/** Salva os 5 valores de um mês inteiro de "Dados Complementares da DRE"
 * (Receita de Vendas de Produtos + os 4 campos de estoque) de uma vez -
 * a grade edita célula a célula, mas a linha inteira do mês é reenviada a
 * cada blur (é um upsert único por competência, não por campo). */
export async function salvarEstoqueMensalAction(input: unknown): Promise<ResultadoEstoqueMensal> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_estoque_mensal_salvar");
    const entrada = validarEntrada(estoqueMensalEntradaSchema, input);
    const estoque = await salvarEstoqueMensal({
      unidadeId: acesso.unidadeId,
      competencia: `${entrada.competencia}-01`,
      receitaVendasProdutos: entrada.receitaVendasProdutos,
      estoqueInicialMercadorias: entrada.estoqueInicialMercadorias,
      estoqueInicialEmbalagens: entrada.estoqueInicialEmbalagens,
      estoqueFinalMercadorias: entrada.estoqueFinalMercadorias,
      estoqueFinalEmbalagens: entrada.estoqueFinalEmbalagens,
      criadoPor: acesso.userId,
    });
    revalidatePath("/financeiro-gerencial/dre");
    return { ok: true, estoque };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar os dados complementares da DRE.") };
  }
}

/** Cada célula de "Saídas de Produtos sem Receita" é uma linha própria
 * (competência + tipo) - salva uma célula por vez. */
export async function salvarSaidaSemReceitaAction(input: unknown): Promise<ResultadoSaidaSemReceita> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_saidas_sem_receita_salvar");
    const entrada = validarEntrada(saidaSemReceitaEntradaSchema, input);
    const saida = await salvarSaidaSemReceita({
      unidadeId: acesso.unidadeId,
      competencia: `${entrada.competencia}-01`,
      tipo: entrada.tipo,
      valor: entrada.valor,
      criadoPor: acesso.userId,
    });
    revalidatePath("/financeiro-gerencial/dre");
    return { ok: true, saida };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a saída sem receita.") };
  }
}
