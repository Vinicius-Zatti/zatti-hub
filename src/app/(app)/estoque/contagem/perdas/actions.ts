"use server";

import { revalidatePath } from "next/cache";
import { getAcessoAtual, registrarAuditoria, requireGestao, exigirEdicao } from "@/lib/acesso";
import { cancelarMovimentacaoBanco, registrarPerdaBanco } from "@/lib/banco/extrato";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { ERRO_EXTRATO_DESLIGADO } from "@/lib/extrato";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { cancelarMovimentacaoSchema, perdaEstoqueSchema, validarEntrada } from "@/lib/validacao";

function revalidarExtrato() {
  revalidatePath("/estoque/contagem/perdas");
  revalidatePath("/estoque/contagem/movimentacoes");
}

/** Gestão, Master e Operacional registram perda (regra 5). O custo é
 * calculado no banco, nunca vem do navegador. */
export async function registrarPerdaAction(input: {
  produtoId: string;
  quantidade: number;
  data: string;
  motivo: string;
  observacao: string | null;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await getAcessoAtual();
  try {
    exigirEdicao(acesso, "estoque");
    if (acesso.fonteDadosEstoque !== "banco") throw new ErroPublico("Unidade sem estoque no Zatti Hub.");
    if (!acesso.extratoEstoqueHabilitado) throw new ErroPublico(ERRO_EXTRATO_DESLIGADO);
    // Mesma chave de limite do recebimento: os dois gravam no extrato do estoque.
    await exigirLimiteRequisicao("recebimento");
    const entrada = validarEntrada(perdaEstoqueSchema, input);
    const id = await registrarPerdaBanco({ ...entrada, unidadeId: acesso.unidadeId });
    await registrarAuditoria({
      acesso,
      acao: "registrar_perda",
      entidade: "estoque_movimentacao",
      entidadeId: id,
      dadosNovos: entrada,
    });
    revalidarExtrato();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Não foi possível registrar a perda.") };
  }
}

/** Só Gestão/Master cancela lançamento manual. O banco repete a regra. */
export async function cancelarMovimentacaoAction(input: {
  movimentacaoId: string;
  motivo: string;
}): Promise<{ ok: true } | { erro: string }> {
  const acesso = await requireGestao();
  try {
    exigirEdicao(acesso, "estoque");
    if (!acesso.extratoEstoqueHabilitado) throw new ErroPublico(ERRO_EXTRATO_DESLIGADO);
    await exigirLimiteRequisicao("recebimento");
    const entrada = validarEntrada(cancelarMovimentacaoSchema, input);
    await cancelarMovimentacaoBanco({ ...entrada, unidadeId: acesso.unidadeId });
    await registrarAuditoria({
      acesso,
      acao: "cancelar_lancamento",
      entidade: "estoque_movimentacao",
      entidadeId: entrada.movimentacaoId,
      dadosNovos: { motivo: entrada.motivo },
    });
    revalidarExtrato();
    return { ok: true };
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Não foi possível cancelar o lançamento.") };
  }
}
