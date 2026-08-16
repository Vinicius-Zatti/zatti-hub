"use server";

import {
  requireConsolidadoVendas,
  requireGestaoConsolidado,
  registrarAuditoria,
} from "@/lib/acesso";
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
import { consolidadoSchema, idUuidSchema, validarEntrada } from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";

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
    ifood: input.ifood,
    food99: input.food99,
  };
}

/** Operacional e Gestão cadastram (igual Contagem hoje usa `getAcessoAtual`
 * em vez de `requireGestao`) - a trava de "não pode sobrescrever" é resolvida
 * aqui bloqueando a criação quando já existe lançamento pra data, não
 * proibindo o papel em si de cadastrar outros dias. */
export async function criarConsolidadoAction(input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await requireConsolidadoVendas();

  try {
    await exigirLimiteRequisicao("consolidado_criar");
    const entrada = validarEntrada(consolidadoSchema, input);
    const existente = await getConsolidadoPorData(acesso.unidadeId, entrada.data);
    if (existente) {
      return {
        ok: false,
        tipo: "ja_existe",
        idExistente: existente.id,
        podeEditar: acesso.role !== "operacional",
      };
    }

    const valores = extrairValores(entrada);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !entrada.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const resultado = await criarConsolidado({
      unidadeId: acesso.unidadeId,
      data: entrada.data,
      valores,
      criadoPor: acesso.userId,
    });
    if (!resultado.ok) {
      // Corrida: alguém salvou a mesma data entre o check acima e o insert.
      const concorrente = await getConsolidadoPorData(acesso.unidadeId, entrada.data);
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
    return {
      ok: false,
      tipo: "erro",
      mensagem: mensagemErroPublica(err, "Nao foi possivel salvar o consolidado."),
    };
  }
}

/** Só Gestão/master edita lançamento já salvo. */
export async function editarConsolidadoAction(id: string, input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await requireGestaoConsolidado();

  try {
    await exigirLimiteRequisicao("consolidado_editar");
    const idValidado = validarEntrada(idUuidSchema, id);
    const entrada = validarEntrada(consolidadoSchema, input);
    const valores = extrairValores(entrada);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !entrada.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const antes = await getConsolidadoPorId(acesso.unidadeId, idValidado);
    const atualizado = await editarConsolidado({
      unidadeId: acesso.unidadeId,
      id: idValidado,
      valores,
      atualizadoPor: acesso.userId,
    });

    await registrarAuditoria({
      acesso,
      acao: "editar",
      entidade: "consolidado_venda",
      entidadeId: idValidado,
      dadosAntigos: antes,
      dadosNovos: atualizado,
    });
    revalidarTudo();
    return { ok: true, id: atualizado.id };
  } catch (err) {
    return {
      ok: false,
      tipo: "erro",
      mensagem: mensagemErroPublica(err, "Nao foi possivel editar o consolidado."),
    };
  }
}
