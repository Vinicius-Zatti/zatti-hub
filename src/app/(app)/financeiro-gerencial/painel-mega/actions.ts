"use server";

import { revalidatePath } from "next/cache";
import { requireGestaoFinanceiroGerencial } from "@/lib/acesso";
import { salvarMetaUnidade } from "@/lib/banco/financeiro-metas";
import { metaUnidadeEntradaSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";

// Sem `registrarAuditoria()`: o gatilho `auditar_escrita_financeiro_gerencial` grava o log no banco.
export type ResultadoMeta = { ok: true } | { ok: false; mensagem: string };

// Gestão e master (`requireGestao` aceita os dois); o banco repete a checagem na RPC.
// Limite: reaproveita a chave de configuração do Financeiro (mesmo padrão dos Cartões), sem
// mexer na lista de `consumir_limite_requisicao`.
export async function salvarMetaUnidadeAction(input: unknown): Promise<ResultadoMeta> {
  const acesso = await requireGestaoFinanceiroGerencial();
  try {
    await exigirLimiteRequisicao("fin_provisao_parametros_salvar");
    const entrada = validarEntrada(metaUnidadeEntradaSchema, input);
    await salvarMetaUnidade({ ...entrada, vigenteDesde: `${entrada.vigenteDesde}-01`, unidadeId: acesso.unidadeId });
    revalidatePath("/financeiro-gerencial/painel-mega");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a meta.") };
  }
}
