"use server";

import { revalidatePath } from "next/cache";
import { exigirEdicao, registrarAuditoria, requireGestao, temPermissao } from "@/lib/acesso";
import { sincronizarCustosPrePreparoMelhorEsforco } from "@/lib/banco/pre-preparo";
import { paresPrePreparoParecidos, unirPrePreparoFichaExistente, type ParPrePreparo } from "@/lib/banco/pre-preparo-uniao";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { idUuidSchema, skuSchema, validarEntrada } from "@/lib/validacao";

export type ResultadoUniaoPrePreparo = { ok: true; sku: string } | { ok: false; mensagem: string };

/** "Usar a ficha existente" (26/10/2026), pelos dois caminhos: a chave
 * Pré-preparo na Edição de Dados e o "Incluir na lista de contagem" da ficha.
 * Une o produto PRE e a ficha PRE que a pessoa escolheu, de uma vez, no banco
 * (quem nasce primeiro dá o SKU). Mexe no produto (Cadastros) e na ficha
 * (Cardápio): Gestão ou master com edição nos dois. Depois o preço do
 * produto passa a vir da ficha. */
export async function unirPrePreparoFichaExistenteAction(
  sku: string,
  fichaId: string,
): Promise<ResultadoUniaoPrePreparo> {
  const acesso = await requireGestao();
  try {
    if (!acesso.fichasTecnicasHabilitado) throw new ErroPublico("Fichas técnicas não estão liberadas nesta unidade.");
    exigirEdicao(acesso, "cadastros");
    exigirEdicao(acesso, "cardapio");
    await exigirLimiteRequisicao("salvar_produtos");
    const skuValidado = validarEntrada(skuSchema, sku).toUpperCase().trim();
    const idValidado = validarEntrada(idUuidSchema, fichaId);

    const skuFinal = await unirPrePreparoFichaExistente({
      unidadeId: acesso.unidadeId,
      sku: skuValidado,
      fichaId: idValidado,
    });
    await registrarAuditoria({
      acesso,
      acao: "unir_pre_preparo_ficha_existente",
      entidade: "produto",
      entidadeId: skuFinal,
      dadosAntigos: { skuProduto: skuValidado, fichaId: idValidado },
      dadosNovos: { sku: skuFinal, fichaPrePreparoId: idValidado, prePreparo: true },
    });
    await sincronizarCustosPrePreparoMelhorEsforco(acesso.unidadeId);

    revalidatePath("/estoque/produtos");
    revalidatePath("/estoque/produtos/edicao");
    revalidatePath("/estoque/contagem");
    revalidatePath("/fichas-tecnicas");
    revalidatePath(`/fichas-tecnicas/${idValidado}`);
    return { ok: true, sku: skuFinal };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível usar a ficha existente.") };
  }
}

/** Lado da ficha: produtos PRE de nome parecido, ainda sem ficha, que o
 * "Incluir na lista de contagem" oferece usar em vez de criar outro produto.
 * Vazio fora do piloto ou sem permissão de unir. */
export async function paresDaFichaAction(fichaId: string): Promise<ParPrePreparo[]> {
  const acesso = await requireGestao();
  try {
    if (!acesso.fichasTecnicasHabilitado) return [];
    if (!temPermissao(acesso, "cadastros", "editar") || !temPermissao(acesso, "cardapio", "editar")) return [];
    const idValidado = validarEntrada(idUuidSchema, fichaId);
    const pares = await paresPrePreparoParecidos(acesso.unidadeId);
    return pares.filter((p) => p.ficha.id === idValidado);
  } catch (err) {
    console.error("Falha ao procurar produto parecido para a ficha:", err);
    return [];
  }
}
