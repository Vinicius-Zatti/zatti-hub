"use server";

import {
  registrarContagem,
  atualizarQuantidadeInventario,
  type NovaContagemLinha,
} from "@/lib/sheets/inventario";
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

/** dataISO no formato AAAA-MM-DD (a data escolhida na Contagem). Sem ela,
 * cai no dia de hoje. */
export async function registrarContagemAction(
  linhas: NovaContagemLinha[],
  dataISO?: string
) {
  let dia: Date;
  if (dataISO) {
    const [ano, mes, diaNum] = dataISO.split("-").map(Number);
    dia = new Date(ano, mes - 1, diaNum);
  } else {
    dia = new Date();
  }

  const dataFmt = dia.toLocaleDateString("pt-BR");
  const mesFmt = `${MESES[dia.getMonth()]} ${dia.getFullYear()}`;

  await registrarContagem(dataFmt, mesFmt, linhas);

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
  try {
    await atualizarQuantidadeInventario(data, sku, quantidade);
  } catch (err) {
    return { erro: (err as Error).message };
  }
  revalidatePath("/estoque/contagem/visualizacao");
  revalidatePath("/estoque/pedidos");
  return { ok: true };
}
