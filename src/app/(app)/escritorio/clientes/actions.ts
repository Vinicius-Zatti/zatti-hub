"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, requireEscritorio, type AcessoAtual } from "@/lib/acesso";
import * as banco from "@/lib/banco/clientes";
import { pareceCredencial } from "@/lib/clientes/jornada";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { exigirLimiteRequisicao, type ChaveLimiteRequisicao } from "@/lib/rate-limit";
import {
  abrirReuniaoSchema,
  diagnosticoClienteSchema,
  etapaClienteSchema,
  excluirRegistroClienteSchema,
  fecharReuniaoSchema,
  indicadorClienteSchema,
  iniciarAcompanhamentoSchema,
  itemClienteSchema,
  linkClienteSchema,
  onboardingClienteSchema,
  validarEntrada,
  visaoGeralClienteSchema,
} from "@/lib/validacao";

export type ResultadoCliente = { ok: true; id?: string; texto?: string } | { ok: false; mensagem: string };

/** Nenhum campo livre da Gestão de Clientes aceita credencial ou dado
 * bancário: a V1 guarda só estado, responsável, link e resumo. */
function recusarCredencial(...textos: string[]) {
  if (textos.some(pareceCredencial)) {
    throw new ErroPublico("Não guarde senha, token, chave ou dado bancário aqui. Registre só onde o acesso está.");
  }
}

/** Esqueleto comum: barreira de master, limite, execução, auditoria e
 * revalidação da página do cliente. Erro interno nunca vaza para a tela. */
async function executar(
  chave: ChaveLimiteRequisicao,
  falha: string,
  acao: (acesso: AcessoAtual) => Promise<{ ok: true; id?: string; texto?: string; acompanhamentoId: string }>,
): Promise<ResultadoCliente> {
  const acesso = await requireEscritorio();
  try {
    await exigirLimiteRequisicao(chave);
    const { acompanhamentoId, ...resultado } = await acao(acesso);
    revalidatePath("/escritorio/clientes");
    revalidatePath(`/escritorio/clientes/${acompanhamentoId}`, "layout");
    return resultado;
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, falha) };
  }
}

const auditar = (acesso: AcessoAtual, acao: string, entidade: string, entidadeId: string, antes: unknown, depois: unknown) =>
  registrarAuditoria({ acesso, acao, entidade, entidadeId, dadosAntigos: antes, dadosNovos: depois });

export async function iniciarAcompanhamentoAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível iniciar o acompanhamento.", async (acesso) => {
    const { organizacaoId } = validarEntrada(iniciarAcompanhamentoSchema, input);
    const id = await banco.iniciarAcompanhamento(organizacaoId);
    await auditar(acesso, "criar", "cliente_acompanhamento", id, null, { organizacaoId });
    return { ok: true, id, acompanhamentoId: id };
  });
}

export async function salvarVisaoGeralAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar a visão geral.", async (acesso) => {
    const e = validarEntrada(visaoGeralClienteSchema, input);
    recusarCredencial(e.objetivoContratado, e.metaPrincipal, e.proximoMarco, e.cadenciaReunioes, ...e.prioridades);
    const { antes } = await banco.salvarVisaoGeral(e);
    await auditar(acesso, "editar", "cliente_acompanhamento", e.acompanhamentoId, antes, e);
    return { ok: true, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function salvarEtapaAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar a etapa.", async (acesso) => {
    const e = validarEntrada(etapaClienteSchema, input);
    recusarCredencial(e.evidencia, e.pendencia, e.criterioConclusao, ...e.checklist.map((c) => c.texto));
    const { antes, etapaAtualAntes } = await banco.salvarEtapa(e);
    await auditar(acesso, "editar", "cliente_etapa", e.acompanhamentoId, { antes, etapaAtualAntes }, e);
    return { ok: true, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function salvarOnboardingAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar o item de onboarding.", async (acesso) => {
    const e = validarEntrada(onboardingClienteSchema, input);
    recusarCredencial(e.item, e.resposta);
    const { id, antes } = await banco.salvarOnboarding(e);
    await auditar(acesso, e.id ? "editar" : "criar", "cliente_onboarding", id, antes, e);
    return { ok: true, id, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function salvarItemAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar o registro.", async (acesso) => {
    const e = validarEntrada(itemClienteSchema, input);
    recusarCredencial(e.texto);
    const { id, antes } = await banco.salvarItem(e);
    await auditar(acesso, e.id ? "editar" : "criar", `cliente_${e.tipo}`, id, antes, e);
    return { ok: true, id, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function abrirReuniaoAction(input: unknown) {
  return executar("clientes_reuniao", "Não foi possível abrir a reunião.", async (acesso) => {
    const e = validarEntrada(abrirReuniaoSchema, input);
    recusarCredencial(e.titulo);
    const { id } = await banco.abrirReuniao(e.acompanhamentoId, e.data, e.titulo);
    await auditar(acesso, "criar", "cliente_reuniao", id, null, e);
    return { ok: true, id, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function fecharReuniaoAction(input: unknown) {
  return executar("clientes_reuniao", "Não foi possível fechar a reunião.", async (acesso) => {
    const e = validarEntrada(fecharReuniaoSchema, input);
    recusarCredencial(e.resumo, e.pautaProxima);
    const { antes, resumoWhatsapp } = await banco.fecharReuniao(e);
    await auditar(acesso, "fechar", "cliente_reuniao", e.reuniaoId, antes, { ...e, resumoWhatsapp });
    return { ok: true, texto: resumoWhatsapp, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function salvarDiagnosticoAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar o diagnóstico.", async (acesso) => {
    const e = validarEntrada(diagnosticoClienteSchema, input);
    recusarCredencial(e.resumo);
    const { antes } = await banco.salvarDiagnostico(e);
    await auditar(acesso, "editar", "cliente_diagnostico", e.acompanhamentoId, antes, e);
    return { ok: true, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function salvarIndicadorAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar o indicador.", async (acesso) => {
    const e = validarEntrada(indicadorClienteSchema, input);
    recusarCredencial(e.nome, e.valor, e.referencia, e.fonte);
    const { id, antes } = await banco.salvarIndicador(e);
    await auditar(acesso, e.id ? "editar" : "criar", "cliente_indicador", id, antes, e);
    return { ok: true, id, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function excluirIndicadorAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível excluir o indicador.", async (acesso) => {
    const e = validarEntrada(excluirRegistroClienteSchema, input);
    const { antes } = await banco.excluirIndicador(e.acompanhamentoId, e.id);
    await auditar(acesso, "excluir", "cliente_indicador", e.id, antes, null);
    return { ok: true, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function salvarLinkAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível salvar o link.", async (acesso) => {
    const e = validarEntrada(linkClienteSchema, input);
    recusarCredencial(e.titulo, e.url, e.observacao);
    const { id, antes } = await banco.salvarLink(e);
    await auditar(acesso, e.id ? "editar" : "criar", "cliente_link", id, antes, e);
    return { ok: true, id, acompanhamentoId: e.acompanhamentoId };
  });
}

export async function excluirLinkAction(input: unknown) {
  return executar("clientes_salvar", "Não foi possível excluir o link.", async (acesso) => {
    const e = validarEntrada(excluirRegistroClienteSchema, input);
    const { antes } = await banco.excluirLink(e.acompanhamentoId, e.id);
    await auditar(acesso, "excluir", "cliente_link", e.id, antes, null);
    return { ok: true, acompanhamentoId: e.acompanhamentoId };
  });
}
