"use server";

import {
  registrarContagem,
  atualizarQuantidadeInventario,
  type NovaContagemLinha,
} from "@/lib/sheets/inventario";
import { getAcessoAtual, registrarAuditoria } from "@/lib/acesso";
import { revalidatePath } from "next/cache";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

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

  let dia: Date;
  if (dataISO) {
    const [ano, mes, diaNum] = dataISO.split("-").map(Number);
    dia = new Date(ano, mes - 1, diaNum);
  } else {
    dia = new Date();
  }

  const dataFmt = dia.toLocaleDateString("pt-BR");
  const mesFmt = `${MESES[dia.getMonth()]} ${dia.getFullYear()}`;

  await registrarContagem(dataFmt, mesFmt, linhas, acesso.spreadsheetId);
  await registrarAuditoria({
    acesso,
    acao: "registrar",
    entidade: "contagem",
    entidadeId: dataFmt,
    dadosNovos: linhas,
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
    await atualizarQuantidadeInventario(data, sku, quantidade, acesso.spreadsheetId);
  } catch (err) {
    return { erro: (err as Error).message };
  }
  await registrarAuditoria({
    acesso,
    acao: "corrigir_quantidade",
    entidade: "contagem_item",
    entidadeId: `${data}:${sku}`,
    dadosNovos: { quantidade },
  });
  revalidatePath("/estoque/contagem/visualizacao");
  revalidatePath("/estoque/pedidos");
  return { ok: true };
}
