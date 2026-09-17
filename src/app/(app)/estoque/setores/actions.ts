"use server";

import { revalidatePath } from "next/cache";
import { requireGestao, registrarAuditoria } from "@/lib/acesso";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import { designacaoSetoresSchema, setorSchema, validarEntrada } from "@/lib/validacao";
import {
  listarSetoresBanco,
  salvarDesignacoesBanco,
  salvarSetorBanco,
  type DesignacaoProduto,
} from "@/lib/banco/setores";

export type ResultadoSetor = { ok: true } | { erro: string };

/** Cria, renomeia, reordena ou desativa um setor. Não existe excluir: setor
 * apagado deixaria contagem antiga órfã. */
export async function salvarSetorAction(entrada: {
  id?: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}): Promise<ResultadoSetor> {
  try {
    const acesso = await requireGestao();
    await exigirLimiteRequisicao("setor_salvar");
    const setor = validarEntrada(setorSchema, entrada);

    if (acesso.fonteDadosEstoque !== "banco") {
      return { erro: "Setor só existe em unidade com estoque no banco." };
    }

    await salvarSetorBanco(acesso.unidadeId, setor);
    await registrarAuditoria({
      acesso,
      acao: setor.id ? "atualizar" : "criar",
      entidade: "setor",
      entidadeId: setor.id ?? setor.nome,
      dadosNovos: setor,
    });

    revalidatePath("/estoque/setores");
    revalidatePath("/estoque/contagem");
    return { ok: true };
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não foi possível salvar o setor.") };
  }
}

/** Designação em massa: cada SKU recebe a lista completa de setores dele.
 * Lista vazia tira o produto de todos os setores e ele cai no alerta de
 * "sem setor". */
export async function designarSetoresAction(
  designacoes: DesignacaoProduto[],
): Promise<ResultadoSetor> {
  try {
    const acesso = await requireGestao();
    await exigirLimiteRequisicao("setor_designar");
    const entrada = validarEntrada(designacaoSetoresSchema, { designacoes });

    if (acesso.fonteDadosEstoque !== "banco") {
      return { erro: "Setor só existe em unidade com estoque no banco." };
    }

    const setores = await listarSetoresBanco(acesso.unidadeId);
    const validos = new Set(setores.filter((setor) => setor.ativo).map((setor) => setor.id));
    const invalido = entrada.designacoes
      .flatMap((designacao) => designacao.setorIds)
      .find((setorId) => !validos.has(setorId));
    if (invalido) {
      return { erro: "Setor inválido ou desativado nesta unidade." };
    }

    await salvarDesignacoesBanco(acesso.unidadeId, entrada.designacoes);
    await registrarAuditoria({
      acesso,
      acao: "atualizar",
      entidade: "produto_setores",
      entidadeId: `${entrada.designacoes.length} produto(s)`,
      dadosNovos: entrada.designacoes,
    });

    revalidatePath("/estoque/setores");
    revalidatePath("/estoque/contagem");
    return { ok: true };
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não foi possível salvar a designação.") };
  }
}
