"use server";

import { getAcessoAtual, requireGestao, registrarAuditoria } from "@/lib/acesso";
import {
  calcularTotais,
  criarConsolidado,
  editarConsolidado,
  getConsolidadoPorData,
  getConsolidadoPorId,
  type EntradaConsolidado,
  type TotaisConsolidado,
} from "@/lib/consolidado-vendas";
import { revalidatePath } from "next/cache";

export type EntradaForm = EntradaConsolidado & {
  data: string;
  confirmarDivergencia: boolean;
};

export type ResultadoSalvar =
  | { ok: true; id: string }
  | { ok: false; tipo: "ja_existe"; idExistente: string; podeEditar: boolean }
  | { ok: false; tipo: "divergencia"; totais: TotaisConsolidado }
  | { ok: false; tipo: "erro"; mensagem: string };

function revalidarTudo() {
  revalidatePath("/financeiro/consolidado");
  revalidatePath("/financeiro/consolidado/dashboard");
}

function extrairValores(input: EntradaForm): EntradaConsolidado {
  return {
    credito: input.credito,
    debito: input.debito,
    pix: input.pix,
    dinheiro: input.dinheiro,
    valeAlimentacao: input.valeAlimentacao,
    salao: input.salao,
    deliveryProprio: input.deliveryProprio,
  };
}

/** Operacional e Gestão cadastram (igual Contagem hoje usa `getAcessoAtual`
 * em vez de `requireGestao`) - a trava de "não pode sobrescrever" é resolvida
 * aqui bloqueando a criação quando já existe lançamento pra data, não
 * proibindo o papel em si de cadastrar outros dias. */
export async function criarConsolidadoAction(input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await getAcessoAtual();

  try {
    const existente = await getConsolidadoPorData(acesso.unidadeId, input.data);
    if (existente) {
      return {
        ok: false,
        tipo: "ja_existe",
        idExistente: existente.id,
        podeEditar: acesso.role !== "operacional",
      };
    }

    const valores = extrairValores(input);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !input.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const resultado = await criarConsolidado({
      unidadeId: acesso.unidadeId,
      data: input.data,
      valores,
      criadoPor: acesso.userId,
    });
    if (!resultado.ok) {
      // Corrida: alguém salvou a mesma data entre o check acima e o insert.
      const concorrente = await getConsolidadoPorData(acesso.unidadeId, input.data);
      return {
        ok: false,
        tipo: "ja_existe",
        idExistente: concorrente?.id ?? "",
        podeEditar: acesso.role !== "operacional",
      };
    }

    await registrarAuditoria({
      acesso,
      acao: "criar",
      entidade: "consolidado_venda",
      entidadeId: resultado.consolidado.id,
      dadosNovos: resultado.consolidado,
    });
    revalidarTudo();
    return { ok: true, id: resultado.consolidado.id };
  } catch (err) {
    return { ok: false, tipo: "erro", mensagem: (err as Error).message };
  }
}

/** Só Gestão/master edita lançamento já salvo. */
export async function editarConsolidadoAction(id: string, input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await requireGestao();

  try {
    const valores = extrairValores(input);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !input.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const antes = await getConsolidadoPorId(acesso.unidadeId, id);
    const atualizado = await editarConsolidado({
      unidadeId: acesso.unidadeId,
      id,
      valores,
      atualizadoPor: acesso.userId,
    });

    await registrarAuditoria({
      acesso,
      acao: "editar",
      entidade: "consolidado_venda",
      entidadeId: id,
      dadosAntigos: antes,
      dadosNovos: atualizado,
    });
    revalidarTudo();
    return { ok: true, id: atualizado.id };
  } catch (err) {
    return { ok: false, tipo: "erro", mensagem: (err as Error).message };
  }
}
