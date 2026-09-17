"use server";

import {
  registrarContagem,
  atualizarQuantidadeInventario,
  type NovaContagemLinha,
} from "@/lib/sheets/inventario";
import { getAcessoAtual, registrarAuditoria } from "@/lib/acesso";
import {
  abrirContagemSchema,
  atualizarQuantidadeContagemSchema,
  corrigirItemContagemSchema,
  registrarContagemSchema,
  registrarContagemSetorSchema,
  validarEntrada,
} from "@/lib/validacao";
import {
  abrirContagemBanco,
  atualizarQuantidadeItemBanco,
  substituirContagemSetorBanco,
} from "@/lib/banco/estoque";
import { listarAndamentoBanco, listarEscopoBanco } from "@/lib/banco/setores";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type LinhaAvulsaSetor = {
  sku: string;
  quantidade: number;
  nomeAvulso?: string;
  unidadeAvulso?: string;
};

export type LinhaAvulsa = {
  sku: string;
  nome: string;
  unidadeBase: string;
  quantidade: string;
};

/** Contagem é o único módulo aberto pros dois papéis (Gestão e
 * Operacional) - por isso usa `getAcessoAtual`, não `requireGestao`. */

/** dataISO no formato AAAA-MM-DD (a data escolhida na Contagem). Sem ela,
 * cai no dia de hoje. */
export async function registrarContagemAction(
  linhas: NovaContagemLinha[],
  dataISO?: string
) {
  const acesso = await getAcessoAtual();
  await exigirLimiteRequisicao("registrar_contagem");
  const entrada = validarEntrada(registrarContagemSchema, { linhas, dataISO });

  let dia: Date;
  if (entrada.dataISO) {
    const [ano, mes, diaNum] = entrada.dataISO.split("-").map(Number);
    dia = new Date(ano, mes - 1, diaNum);
  } else {
    dia = new Date();
  }

  const dataFmt = dia.toLocaleDateString("pt-BR");
  const mesFmt = `${MESES[dia.getMonth()]} ${dia.getFullYear()}`;

  await registrarContagem(dataFmt, mesFmt, entrada.linhas, acesso.spreadsheetId);
  await registrarAuditoria({
    acesso,
    acao: "registrar",
    entidade: "contagem",
    entidadeId: dataFmt,
    dadosNovos: entrada.linhas,
  });

  revalidatePath("/estoque/contagem");
  revalidatePath("/estoque/pedidos");
}

/** Corrige a quantidade de um item da última contagem (única que ainda pode
 * ser corrigida). Recalcula total/alerta na planilha e devolve, pra tela
 * atualizar com o valor de verdade em vez de confiar em conta feita no
 * navegador. */
export async function atualizarQuantidadeContagemAction(
  data: string,
  sku: string,
  quantidade: number
): Promise<{ ok: true } | { erro: string }> {
  const acesso = await getAcessoAtual();
  try {
    await exigirLimiteRequisicao("corrigir_contagem");
    const entrada = validarEntrada(atualizarQuantidadeContagemSchema, { data, sku, quantidade });
    await atualizarQuantidadeInventario(
      entrada.data,
      entrada.sku,
      entrada.quantidade,
      acesso.spreadsheetId,
    );
    await registrarAuditoria({
      acesso,
      acao: "corrigir_quantidade",
      entidade: "contagem_item",
      entidadeId: `${entrada.data}:${entrada.sku}`,
      dadosNovos: { quantidade: entrada.quantidade },
    });
  } catch (err) {
    return { erro: mensagemErroPublica(err, "Nao foi possivel corrigir a contagem.") };
  }
  revalidatePath("/estoque/contagem/visualizacao");
  revalidatePath("/estoque/pedidos");
  return { ok: true };
}

// --- Contagem por setor -----------------------------------------------------

/** Abre a contagem da data e devolve a lista congelada daquele setor.
 * Chamada no "Iniciar contagem", antes de a pessoa ver qualquer item: é o
 * snapshot, e não a designação de agora, que manda na contagem inteira. */
export async function abrirContagemAction(dataISO: string, setorId: string) {
  if (!CONTAGEM_POR_SETOR_ATIVA) {
    throw new ErroPublico("A contagem por setor ainda não está ativa nesta versão.");
  }
  const acesso = await getAcessoAtual();
  await exigirLimiteRequisicao("contagem_abrir");
  const entrada = validarEntrada(abrirContagemSchema, { dataISO, setorId });

  if (acesso.fonteDadosEstoque !== "banco") {
    throw new ErroPublico("Contagem por setor só existe com o estoque no banco.");
  }

  const [ano, mes, dia] = entrada.dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const dataBr = data.toLocaleDateString("pt-BR");
  const mesFmt = `${MESES[data.getMonth()]} ${data.getFullYear()}`;

  await abrirContagemBanco(acesso.unidadeId, dataBr, mesFmt);

  const [escopo, andamento] = await Promise.all([
    listarEscopoBanco(acesso.unidadeId, dataBr),
    listarAndamentoBanco(acesso.unidadeId),
  ]);

  const doSetor = escopo.filter((linha) => linha.setorId === entrada.setorId);
  const estado = (andamento.get(dataBr) ?? []).find((s) => s.setorId === entrada.setorId);

  return {
    skus: doSetor.map((linha) => linha.sku),
    setorNome: doSetor[0]?.setorNome ?? estado?.setorNome ?? "",
    jaConcluido: estado?.situacao === "concluido",
  };
}

/** Grava a contagem do setor substituindo o que aquele setor já tinha gravado
 * na data. A substituição inteira acontece dentro de uma transação no
 * Postgres (`substituir_contagem_setor`). */
export async function registrarContagemSetorAction(
  dataISO: string,
  setorId: string,
  linhas: LinhaAvulsaSetor[],
) {
  if (!CONTAGEM_POR_SETOR_ATIVA) {
    throw new ErroPublico("A contagem por setor ainda não está ativa nesta versão.");
  }
  const acesso = await getAcessoAtual();
  await exigirLimiteRequisicao("registrar_contagem");
  const entrada = validarEntrada(registrarContagemSetorSchema, { dataISO, setorId, linhas });

  if (acesso.fonteDadosEstoque !== "banco") {
    throw new ErroPublico("Contagem por setor só existe com o estoque no banco.");
  }

  const [ano, mes, dia] = entrada.dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const dataBr = data.toLocaleDateString("pt-BR");
  const mesFmt = `${MESES[data.getMonth()]} ${data.getFullYear()}`;

  // Reabre pelo servidor em vez de confiar num id vindo do navegador.
  const contagemId = await abrirContagemBanco(acesso.unidadeId, dataBr, mesFmt);
  const gravados = await substituirContagemSetorBanco(
    contagemId,
    entrada.setorId,
    entrada.linhas,
    acesso.unidadeId,
  );

  await registrarAuditoria({
    acesso,
    acao: "registrar",
    entidade: "contagem_setor",
    entidadeId: `${dataBr} / ${entrada.setorId}`,
    dadosNovos: { itens: gravados, linhas: entrada.linhas },
  });

  revalidatePath("/estoque/contagem");
  revalidatePath("/estoque/contagem/visualizacao");
  revalidatePath("/estoque/pedidos");
  return { gravados };
}

/** Corrige a quantidade de UM item da contagem, identificado pelo id.
 * Com setor, o mesmo SKU existe em várias linhas da mesma data: corrigir "o
 * primeiro que achar" mexeria no setor errado. */
export async function corrigirItemContagemAction(itemId: string, quantidade: number) {
  try {
    const acesso = await getAcessoAtual();
    await exigirLimiteRequisicao("corrigir_contagem");
    const entrada = validarEntrada(corrigirItemContagemSchema, { itemId, quantidade });

    if (acesso.fonteDadosEstoque !== "banco") {
      throw new ErroPublico("Correção por item só existe com o estoque no banco.");
    }

    await atualizarQuantidadeItemBanco(entrada.itemId, entrada.quantidade, acesso.unidadeId);
    await registrarAuditoria({
      acesso,
      acao: "corrigir",
      entidade: "contagem_item",
      entidadeId: entrada.itemId,
      dadosNovos: { quantidade: entrada.quantidade },
    });

    revalidatePath("/estoque/contagem/visualizacao");
    revalidatePath("/estoque/pedidos");
    return { ok: true as const };
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não foi possível corrigir a quantidade.") };
  }
}
