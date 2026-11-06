"use server";

import {
  requireConsolidadoVendas,
  requireGestaoConsolidado,
  registrarAuditoria,
  exigirEdicao,
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
import { bloqueioTrocaDataConsolidado } from "@/lib/consolidado-data";
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
    exigirEdicao(acesso, "vendas");
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

/** Só Gestão/master edita lançamento já salvo; trocar a data, só master. */
export async function editarConsolidadoAction(id: string, input: EntradaForm): Promise<ResultadoSalvar> {
  const acesso = await requireGestaoConsolidado();

  try {
    exigirEdicao(acesso, "vendas");
    exigirEdicao(acesso, "vendas.editar_dia_lancado");
    await exigirLimiteRequisicao("consolidado_editar");
    const idValidado = validarEntrada(idUuidSchema, id);
    const entrada = validarEntrada(consolidadoSchema, input);
    const valores = extrairValores(entrada);
    const totais = calcularTotais(valores);
    if (totais.status === "divergente" && !entrada.confirmarDivergencia) {
      return { ok: false, tipo: "divergencia", totais };
    }

    const antes = await getConsolidadoPorId(acesso.unidadeId, idValidado);
    if (!antes) return { ok: false, tipo: "erro", mensagem: "Lançamento não encontrado." };

    // Troca de data: só o master (06/11/2026). Dia de destino já lançado não
    // é sobrescrito - mesmo aviso de "já existe" da criação.
    const trocaData = entrada.data !== antes.data;
    const bloqueio = bloqueioTrocaDataConsolidado(acesso.role, antes.data, entrada.data);
    if (bloqueio) return { ok: false, tipo: "erro", mensagem: bloqueio };
    if (trocaData) {
      const ocupado = await getConsolidadoPorData(acesso.unidadeId, entrada.data);
      if (ocupado) return { ok: false, tipo: "ja_existe", idExistente: ocupado.id, podeEditar: true };
    }

    const resultado = await editarConsolidado({
      unidadeId: acesso.unidadeId,
      id: idValidado,
      valores,
      atualizadoPor: acesso.userId,
      novaData: trocaData ? entrada.data : undefined,
    });
    if (!resultado.ok) {
      // Corrida: alguém lançou a data de destino entre o check acima e o update.
      const concorrente = await getConsolidadoPorData(acesso.unidadeId, entrada.data);
      return { ok: false, tipo: "ja_existe", idExistente: concorrente?.id ?? "", podeEditar: true };
    }
    const atualizado = resultado.consolidado;

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
