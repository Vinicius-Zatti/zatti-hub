/** Cotação com mais de uma contagem base (pedido de Vinícius, 13/10/2026).
 * Setores que contam em dias diferentes (The House: bar no sábado, cozinha e
 * limpeza no domingo) precisam de um consolidado pra comprar. Regras puras,
 * sem Supabase e sem Next, testadas isolado em `varias-datas.test.ts`.
 *
 * Regra: pra cada produto, cada setor entra com a contagem MAIS RECENTE dele
 * entre as datas escolhidas; o estoque atual é a soma dos setores, a mesma
 * conta de uma data só. O mesmo setor nunca é somado duas vezes (se contou nas
 * duas datas, vale só a última). Produto de um setor só, ou contagem sem setor
 * (legada/planilha), fica com a contagem mais recente em que foi contado. Se a
 * contagem mais recente do produto é sem setor, ela vale sozinha: linha sem
 * setor já é a unidade inteira e não pode somar com setor de data mais antiga. */

import type { ItemInventario } from "@/lib/types";
import type { AndamentoSetor, EscopoSetor } from "@/lib/contagem/setor";
import { ordenarDatasContagemBase } from "@/lib/pedido";

/** `?data=` aceita uma data ou várias separadas por vírgula. Só vale o que
 * existe na lista de contagens da unidade (entrada do usuário nunca é
 * confiada); vazio cai na mais recente. Devolve mais recente primeiro: a
 * primeira é a contagem base, que dá nome ao pedido gravado. */
export function escolherDatasContagem(param: string | undefined, disponiveis: string[]): string[] {
  const pedidas = (param ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => disponiveis.includes(d));
  const unicas = Array.from(new Set(pedidas));
  if (unicas.length === 0) return disponiveis.length > 0 ? [disponiveis[0]] : [];
  return ordenarDatasContagemBase(unicas);
}

export type ConsolidadoVariasDatas = {
  /** Linhas escolhidas, da data mais antiga pra mais recente: pra cada
   * produto x setor, só as da data mais recente em que aquele setor contou o
   * produto. Entram na soma por SKU (`quantidadePorSku`) como sempre. */
  itens: ItemInventario[];
  /** Datas de onde veio o estoque de cada SKU, mais recente primeiro. */
  datasPorSku: Map<string, string[]>;
};

export function consolidarVariasDatas(itens: ItemInventario[], datas: string[]): ConsolidadoVariasDatas {
  const posicao = new Map(ordenarDatasContagemBase(Array.from(new Set(datas))).map((d, i) => [d, i]));
  // sku -> setor (vazio = sem setor) -> posição da data -> linhas
  const porSku = new Map<string, Map<string, Map<number, ItemInventario[]>>>();
  for (const item of itens) {
    const pos = posicao.get(item.data);
    if (pos === undefined) continue;
    const porSetor = porSku.get(item.sku) ?? new Map<string, Map<number, ItemInventario[]>>();
    const porData = porSetor.get(item.setorId ?? "") ?? new Map<number, ItemInventario[]>();
    porData.set(pos, [...(porData.get(pos) ?? []), item]);
    porSetor.set(item.setorId ?? "", porData);
    porSku.set(item.sku, porSetor);
  }

  const escolhidos: ItemInventario[] = [];
  const datasPorSku = new Map<string, string[]>();
  for (const [sku, porSetor] of porSku) {
    const linhasDoSku = Array.from(porSetor.values()).flatMap((porData) => Array.from(porData.values()).flat());
    const topo = Math.min(...linhasDoSku.filter((l) => l.quantidade !== null).map((l) => posicao.get(l.data)!));
    const escolhidasDoSku: ItemInventario[] = [];
    if (!Number.isFinite(topo)) {
      // Ninguém informou quantidade: fica a data mais recente, item "não contado".
      const maisRecente = Math.min(...linhasDoSku.map((l) => posicao.get(l.data)!));
      escolhidasDoSku.push(...linhasDoSku.filter((l) => posicao.get(l.data) === maisRecente));
    } else if (linhasDoSku.some((l) => !l.setorId && l.quantidade !== null && posicao.get(l.data) === topo)) {
      escolhidasDoSku.push(...linhasDoSku.filter((l) => posicao.get(l.data) === topo));
    } else {
      for (const [setorId, porData] of porSetor) {
        if (!setorId) continue;
        const posicoes = Array.from(porData.keys()).sort((a, b) => a - b);
        const comQuantidade = posicoes.find((p) => porData.get(p)!.some((l) => l.quantidade !== null));
        escolhidasDoSku.push(...porData.get(comQuantidade ?? posicoes[0])!);
      }
    }
    escolhidos.push(...escolhidasDoSku);
    const datasContadas = escolhidasDoSku.filter((l) => l.quantidade !== null).map((l) => l.data);
    datasPorSku.set(sku, ordenarDatasContagemBase(Array.from(new Set(datasContadas))));
  }

  // Mais antiga primeiro, estável: quem lê "a última linha vale" (preço na
  // contagem) continua pegando a mais recente, e uma data só fica como era.
  const ordemOriginal = new Map(itens.map((item, i) => [item, i]));
  escolhidos.sort(
    (a, b) => posicao.get(b.data)! - posicao.get(a.data)! || ordemOriginal.get(a)! - ordemOriginal.get(b)!,
  );
  return { itens: escolhidos, datasPorSku };
}

/** Escopo das datas escolhidas sem repetir produto x setor. A data mais
 * recente manda nos metadados (nome, grupo, unidade). */
export function escopoDeVariasDatas(escopoPorData: Map<string, EscopoSetor[]>, datas: string[]): EscopoSetor[] {
  const vistos = new Set<string>();
  const resultado: EscopoSetor[] = [];
  for (const data of ordenarDatasContagemBase(Array.from(new Set(datas)))) {
    for (const linha of escopoPorData.get(data) ?? []) {
      const chave = `${linha.sku}|${linha.setorId}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      resultado.push(linha);
    }
  }
  return resultado;
}

/** Um setor conta como concluído se fechou em qualquer uma das datas
 * escolhidas (vale o envio mais recente); pendente só quem não fechou em
 * nenhuma. Data legada (sem andamento) não acrescenta setor. */
export function andamentoDeVariasDatas(
  andamentoPorData: Map<string, AndamentoSetor[]>,
  datas: string[],
): AndamentoSetor[] {
  const porSetor = new Map<string, AndamentoSetor>();
  for (const data of ordenarDatasContagemBase(Array.from(new Set(datas)))) {
    for (const setor of andamentoPorData.get(data) ?? []) {
      const atual = porSetor.get(setor.setorId);
      if (!atual || (atual.situacao !== "concluido" && setor.situacao === "concluido")) {
        porSetor.set(setor.setorId, setor);
      }
    }
  }
  return Array.from(porSetor.values()).sort((a, b) => a.setorNome.localeCompare(b.setorNome));
}
