"use server";

import {
  registrarContagem,
  atualizarQuantidadeInventario,
  type NovaContagemLinha,
} from "@/lib/sheets/inventario";
import { getAcessoAtual, registrarAuditoria } from "@/lib/acesso";
import {
  atualizarQuantidadeContagemSchema,
  registrarContagemSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
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
