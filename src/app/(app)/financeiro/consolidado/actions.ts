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
import { paraErroPublico } from "@/lib/erros";
import { exigirLimite, chaveUsuario } from "@/lib/rate-limit";
import { validar, entradaConsolidadoSchema, editarConsolidadoSchema } from "@/lib/validacao";
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

function extrairValores(input: EntradaConsolidado): EntradaConsolidado {
  return {
    credito: input.credito,
    debito: input.debito,
    pix: input.pix,
    dinheiro: input.dinheiro,
    valeAlimentacao: input.valeAlimentacao,
    salao: input.salao,
    deliveryProprio: input.deliveryProprio,
    ifood: input.ifood,
    food99: input.food99,
  };
}

/** Operacional e Gestão cadastram (igual Contagem hoje usa `getAcessoAtual`
 * em vez de `requireGestao`) - a trava de "não pode sobrescrever" é resolvida
 * aqui bloqueando a criação quando já existe lançamento pra data, não
 * proibindo o papel em si de cadastrar outros dias. */
export async function criarConsolidadoAction(input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await getAcessoAtual();

  try {
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(entradaConsolidadoSchema, input, "criarConsolidadoAction");

    const existente = await getConsolidadoPorData(acesso.unidadeId, dados.data);
    if (existente) {
      return {
        ok: false,
        tipo: "ja_existe",
        idExistente: existente.id,
        podeEditar: acesso.role !== "operacional",
      };
    }

    const valores = extrairValores(dados);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !dados.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const resultado = await criarConsolidado({
      unidadeId: acesso.unidadeId,
      data: dados.data,
      valores,
      criadoPor: acesso.userId,
    });
    if (!resultado.ok) {
      // Corrida: alguém salvou a mesma data entre o check acima e o insert.
      const concorrente = await getConsolidadoPorData(acesso.unidadeId, dados.data);
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
    return { ok: false, tipo: "erro", mensagem: paraErroPublico(err, "criarConsolidadoAction") };
  }
}

/** Só Gestão/master edita lançamento já salvo. */
export async function editarConsolidadoAction(id: string, input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await requireGestao();

  try {
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(editarConsolidadoSchema, { id, entrada: input }, "editarConsolidadoAction");

    const valores = extrairValores(dados.entrada);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !dados.entrada.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const antes = await getConsolidadoPorId(acesso.unidadeId, dados.id);
    const atualizado = await editarConsolidado({
      unidadeId: acesso.unidadeId,
      id: dados.id,
      valores,
      atualizadoPor: acesso.userId,
    });

    await registrarAuditoria({
      acesso,
      acao: "editar",
      entidade: "consolidado_venda",
      entidadeId: dados.id,
      dadosAntigos: antes,
      dadosNovos: atualizado,
    });
    revalidarTudo();
    return { ok: true, id: atualizado.id };
  } catch (err) {
    return { ok: false, tipo: "erro", mensagem: paraErroPublico(err, "editarConsolidadoAction") };
  }
}
