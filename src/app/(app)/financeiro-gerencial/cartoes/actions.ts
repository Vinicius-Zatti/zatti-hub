"use server";

import { revalidatePath } from "next/cache";
import { requireFinanceiroGerencial, requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { alterarVencimentoFatura, pagarFatura } from "@/lib/banco/financeiro-cartao";
import { alterarVencimentoFaturaEntradaSchema, pagarFaturaEntradaSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";

// Sem `registrarAuditoria()`: os gatilhos de auditoria do banco já gravam fatura, pagamento e baixas.
export type ResultadoCartao = { ok: true } | { ok: false; mensagem: string };

function revalidarCartao() {
  revalidatePath("/financeiro-gerencial/cartoes");
  revalidatePath("/financeiro-gerencial/contas-pagar-receber");
  revalidatePath("/financeiro-gerencial/contas");
  revalidatePath("/financeiro-gerencial/lancamentos/despesas");
}

export async function pagarFaturaAction(input: unknown): Promise<ResultadoCartao> {
  const acesso = await requireFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_baixa_registrar");
    const entrada = validarEntrada(pagarFaturaEntradaSchema, input);
    await pagarFatura({ ...entrada, unidadeId: acesso.unidadeId });
    revalidarCartao();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível registrar o pagamento da fatura.") };
  }
}

// Gestão e master (`requireGestao` aceita os dois); o banco repete a checagem na RPC.
export async function alterarVencimentoFaturaAction(input: unknown): Promise<ResultadoCartao> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_lancamento_editar");
    const entrada = validarEntrada(alterarVencimentoFaturaEntradaSchema, input);
    await alterarVencimentoFatura({ ...entrada, unidadeId: acesso.unidadeId });
    revalidarCartao();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível alterar o vencimento da fatura.") };
  }
}
