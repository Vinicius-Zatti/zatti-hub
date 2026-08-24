"use server";

import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { arquivarCategoriaPersonalizada, criarCategoriaPersonalizada, editarCategoriaPersonalizada } from "@/lib/banco/financeiro-gerencial";
import {
  arquivarCategoriaFinanceiraEntradaSchema,
  categoriaFinanceiraEntradaSchema,
  editarCategoriaFinanceiraEntradaSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { revalidatePath } from "next/cache";
import type { CategoriaFinanceira } from "@/lib/financeiro-gerencial/tipos";

// Sem `registrarAuditoria()` aqui - o gatilho `auditar_escrita_financeiro_gerencial`
// (migração `20260824090000_...sql`) grava o log direto no banco pra
// qualquer INSERT/UPDATE em `fin_categorias`, então chamar os dois
// duplicaria a linha.
export type ResultadoCategoria = { ok: true; categoria: CategoriaFinanceira } | { ok: false; mensagem: string };

export async function criarCategoriaFinanceiraAction(input: unknown): Promise<ResultadoCategoria> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_categoria_criar");
    const entrada = validarEntrada(categoriaFinanceiraEntradaSchema, input);
    const categoria = await criarCategoriaPersonalizada({ ...entrada, unidadeId: acesso.unidadeId });
    revalidatePath("/financeiro-gerencial/categorias");
    return { ok: true, categoria };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a categoria.") };
  }
}

export async function editarCategoriaFinanceiraAction(input: unknown): Promise<ResultadoCategoria> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_categoria_editar");
    const entrada = validarEntrada(editarCategoriaFinanceiraEntradaSchema, input);
    const categoria = await editarCategoriaPersonalizada({ ...entrada, unidadeId: acesso.unidadeId });
    revalidatePath("/financeiro-gerencial/categorias");
    return { ok: true, categoria };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível editar a categoria.") };
  }
}

export async function arquivarCategoriaFinanceiraAction(input: unknown): Promise<ResultadoCategoria> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_categoria_editar");
    const entrada = validarEntrada(arquivarCategoriaFinanceiraEntradaSchema, input);
    const categoria = await arquivarCategoriaPersonalizada({ ...entrada, unidadeId: acesso.unidadeId });
    revalidatePath("/financeiro-gerencial/categorias");
    return { ok: true, categoria };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível arquivar a categoria.") };
  }
}
