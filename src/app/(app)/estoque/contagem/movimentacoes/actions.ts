"use server";

import { getAcessoAtual } from "@/lib/acesso";
import { listarExtratoCompleto } from "@/lib/banco/extrato";
import { ERRO_EXTRATO_DESLIGADO, gerarCsvExtrato, lerFiltroExtrato } from "@/lib/extrato";
import { mensagemErroPublica } from "@/lib/erros";

/** CSV completo do filtro atual (todas as páginas, não só a visível). */
export async function exportarExtratoCsvAction(
  params: Record<string, string | undefined>,
): Promise<{ csv: string } | { erro: string }> {
  const acesso = await getAcessoAtual();
  if (acesso.fonteDadosEstoque !== "banco") return { erro: "Unidade sem estoque no Zatti Hub." };
  if (!acesso.extratoEstoqueHabilitado) return { erro: ERRO_EXTRATO_DESLIGADO };
  try {
    const filtro = lerFiltroExtrato(params ?? {});
    const linhas = await listarExtratoCompleto(acesso.unidadeId, filtro);
    return { csv: gerarCsvExtrato(linhas) };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Não foi possível gerar o CSV do extrato.") };
  }
}
