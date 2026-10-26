"use server";

import {
  registrarContagem,
  atualizarQuantidadeInventario,
  type NovaContagemLinha,
} from "@/lib/sheets/inventario";
import { getAcessoAtual, registrarAuditoria, exigirEdicao } from "@/lib/acesso";
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
  corrigirItemContagemBanco,
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
): Promise<{ ok: true } | { erro: string }> {
  try {
    await registrarContagemLegada(linhas, dataISO);
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não deu pra registrar agora. Tenta de novo em instantes.") };
  }
  return { ok: true };
}

async function registrarContagemLegada(linhas: NovaContagemLinha[], dataISO?: string) {
  const acesso = await getAcessoAtual();
  exigirEdicao(acesso, "estoque");
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
    exigirEdicao(acesso, "estoque");
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

export type ItemDoSnapshot = {
  sku: string;
  nome: string;
  grupo: string;
  unidadeBase: string;
};

export type ContagemAberta = {
  /** Lista congelada do setor na data, com os metadados da abertura. */
  itens: ItemDoSnapshot[];
  setorNome: string;
  jaConcluido: boolean;
  /** Versão do setor que esta tela viu; vai junto no envio. */
  versao: number;
};

function dataDaEntrada(dataISO: string) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return {
    dataBr: data.toLocaleDateString("pt-BR"),
    mesFmt: `${MESES[data.getMonth()]} ${data.getFullYear()}`,
  };
}

/** Abre a contagem da data e devolve a lista congelada daquele setor.
 * Chamada no "Iniciar contagem", antes de a pessoa ver qualquer item: é o
 * snapshot, e não a designação nem o cadastro de agora, que manda na
 * contagem inteira. */
export async function abrirContagemAction(
  dataISO: string,
  setorId: string,
): Promise<ContagemAberta | { erro: string }> {
  try {
    if (!CONTAGEM_POR_SETOR_ATIVA) {
      throw new ErroPublico("A contagem por setor ainda não está ativa nesta versão.");
    }
    const acesso = await getAcessoAtual();
    exigirEdicao(acesso, "estoque");
    await exigirLimiteRequisicao("contagem_abrir");
    const entrada = validarEntrada(abrirContagemSchema, { dataISO, setorId });

    if (acesso.fonteDadosEstoque !== "banco") {
      throw new ErroPublico("Contagem por setor só existe com o estoque no banco.");
    }

    const { dataBr, mesFmt } = dataDaEntrada(entrada.dataISO);
    await abrirContagemBanco(acesso.unidadeId, dataBr, mesFmt);

    const [escopo, andamento] = await Promise.all([
      listarEscopoBanco(acesso.unidadeId, dataBr),
      listarAndamentoBanco(acesso.unidadeId),
    ]);

    const doSetor = escopo.filter((linha) => linha.setorId === entrada.setorId);
    const estado = (andamento.get(dataBr) ?? []).find((s) => s.setorId === entrada.setorId);

    return {
      itens: doSetor.map((linha) => ({
        sku: linha.sku,
        nome: linha.nome ?? linha.sku,
        grupo: linha.grupo ?? "",
        unidadeBase: linha.unidadeBase ?? "",
      })),
      setorNome: doSetor[0]?.setorNome ?? estado?.setorNome ?? "",
      jaConcluido: estado?.situacao === "concluido",
      versao: estado?.versao ?? 0,
    };
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não deu pra abrir a contagem agora. Tenta de novo em instantes.") };
  }
}

/** Grava a contagem do setor substituindo o que aquele setor já tinha gravado
 * na data. A substituição inteira acontece dentro de uma transação no
 * Postgres (`substituir_contagem_setor`), que recusa envio incompleto, SKU de
 * fora da lista, quantidade negativa e versão desatualizada, e guarda o
 * histórico em `contagem_envios`. */
export async function registrarContagemSetorAction(
  dataISO: string,
  setorId: string,
  linhas: LinhaAvulsaSetor[],
  versaoEsperada: number,
  motivo?: string,
): Promise<{ ok: true; gravados: number; versao: number } | { erro: string }> {
  try {
    if (!CONTAGEM_POR_SETOR_ATIVA) {
      throw new ErroPublico("A contagem por setor ainda não está ativa nesta versão.");
    }
    const acesso = await getAcessoAtual();
    exigirEdicao(acesso, "estoque");
    await exigirLimiteRequisicao("registrar_contagem");
    const entrada = validarEntrada(registrarContagemSetorSchema, {
      dataISO,
      setorId,
      linhas,
      versaoEsperada,
      ...(motivo ? { motivo } : {}),
    });

    if (acesso.fonteDadosEstoque !== "banco") {
      throw new ErroPublico("Contagem por setor só existe com o estoque no banco.");
    }

    const { dataBr, mesFmt } = dataDaEntrada(entrada.dataISO);

    // Reabre pelo servidor em vez de confiar num id vindo do navegador.
    const contagemId = await abrirContagemBanco(acesso.unidadeId, dataBr, mesFmt);
    const { gravados, versao } = await substituirContagemSetorBanco(
      contagemId,
      entrada.setorId,
      entrada.linhas,
      entrada.versaoEsperada,
      entrada.motivo,
    );

    // O histórico completo (antes/depois) já ficou em contagem_envios, na
    // mesma transação. Este log é só o rastro geral do app.
    await registrarAuditoria({
      acesso,
      acao: "registrar",
      entidade: "contagem_setor",
      entidadeId: `${dataBr} / ${entrada.setorId}`,
      dadosNovos: { itens: gravados, versao, motivo: entrada.motivo ?? null },
    });

    revalidatePath("/estoque/contagem");
    revalidatePath("/estoque/contagem/visualizacao");
    revalidatePath("/estoque/pedidos");
    return { ok: true, gravados, versao };
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não deu pra registrar agora. Tenta de novo em instantes.") };
  }
}

/** Corrige a quantidade de UM item da contagem, identificado pelo id.
 * Com setor, o mesmo SKU existe em várias linhas da mesma data: corrigir "o
 * primeiro que achar" mexeria no setor errado. */
export async function corrigirItemContagemAction(
  itemId: string,
  quantidade: number,
  versaoEsperada: number | null,
  motivo?: string,
) {
  try {
    const acesso = await getAcessoAtual();
    exigirEdicao(acesso, "estoque");
    await exigirLimiteRequisicao("corrigir_contagem");
    const entrada = validarEntrada(corrigirItemContagemSchema, {
      itemId,
      quantidade,
      versaoEsperada,
      ...(motivo ? { motivo } : {}),
    });

    if (acesso.fonteDadosEstoque !== "banco") {
      throw new ErroPublico("Correção por item só existe com o estoque no banco.");
    }

    const versao = await corrigirItemContagemBanco(
      entrada.itemId,
      entrada.quantidade,
      acesso.unidadeId,
      entrada.versaoEsperada,
      entrada.motivo,
    );
    await registrarAuditoria({
      acesso,
      acao: "corrigir",
      entidade: "contagem_item",
      entidadeId: entrada.itemId,
      dadosNovos: { quantidade: entrada.quantidade, versao, motivo: entrada.motivo ?? null },
    });

    revalidatePath("/estoque/contagem/visualizacao");
    revalidatePath("/estoque/pedidos");
    return { ok: true as const, versao };
  } catch (erro) {
    return { erro: mensagemErroPublica(erro, "Não foi possível corrigir a quantidade.") };
  }
}
