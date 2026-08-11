"use server";

import {
  registrarContagem,
  atualizarQuantidadeInventario,
  type NovaContagemLinha,
} from "@/lib/sheets/inventario";
import { getAcessoAtual, registrarAuditoria } from "@/lib/acesso";
import { paraErroPublico } from "@/lib/erros";
import { exigirLimite, chaveUsuario } from "@/lib/rate-limit";
import { validar, registrarContagemSchema, atualizarQuantidadeContagemSchema } from "@/lib/validacao";
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
): Promise<void> {
  const acesso = await getAcessoAtual();

  try {
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(registrarContagemSchema, { linhas, dataISO }, "registrarContagemAction");

    let dia: Date;
    if (dados.dataISO) {
      const [ano, mes, diaNum] = dados.dataISO.split("-").map(Number);
      dia = new Date(ano, mes - 1, diaNum);
    } else {
      dia = new Date();
    }

    const dataFmt = dia.toLocaleDateString("pt-BR");
    const mesFmt = `${MESES[dia.getMonth()]} ${dia.getFullYear()}`;

    await registrarContagem(dataFmt, mesFmt, dados.linhas, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "registrar",
      entidade: "contagem",
      entidadeId: dataFmt,
      dadosNovos: dados.linhas,
    });

    revalidatePath("/estoque/contagem");
    revalidatePath("/estoque/pedidos");
  } catch (err) {
    // Mantém o contrato original (lança em vez de devolver `{ erro }`) - o
    // componente que chama isso só faz try/catch genérico, sem ler mensagem.
    throw new Error(paraErroPublico(err, "registrarContagemAction"));
  }
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
    await exigirLimite(chaveUsuario(acesso.userId), "escrita_padrao");
    const dados = validar(
      atualizarQuantidadeContagemSchema,
      { data, sku, quantidade },
      "atualizarQuantidadeContagemAction"
    );
    await atualizarQuantidadeInventario(dados.data, dados.sku, dados.quantidade, acesso.spreadsheetId);
    await registrarAuditoria({
      acesso,
      acao: "corrigir_quantidade",
      entidade: "contagem_item",
      entidadeId: `${dados.data}:${dados.sku}`,
      dadosNovos: { quantidade: dados.quantidade },
    });
    revalidatePath("/estoque/contagem/visualizacao");
    revalidatePath("/estoque/pedidos");
    return { ok: true };
  } catch (err) {
    return { erro: paraErroPublico(err, "atualizarQuantidadeContagemAction") };
  }
}
