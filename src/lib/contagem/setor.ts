/** Regras da contagem por setor, sem Supabase e sem Next - o cálculo que
 * decide "quanto tem de verdade" e "esta data está fechada?" é o mesmo pra
 * Conferência, Cotação e CMV, então mora aqui e é testado isolado.
 *
 * A regra central: o total da unidade é a SOMA dos setores, nunca o último
 * valor gravado. Antes desta versão, Cotação sobrescrevia por SKU e o CMV
 * somava, e os dois discordavam quando o mesmo item aparecia duas vezes. */

import type { ItemInventario } from "@/lib/types";

export type SituacaoSetor = "pendente" | "concluido";

/** `legada` = contagem anterior ao controle de setor (ou unidade ainda na
 * planilha). Conta como completa: sem isso, o histórico dos clientes antigos
 * viraria "parcial" da noite pro dia e sumiria do CMV. */
export type SituacaoData = "completa" | "parcial" | "legada";

export type AndamentoSetor = {
  setorId: string;
  setorNome: string;
  situacao: SituacaoSetor;
  enviadoEm: string | null;
  enviadoPor: string | null;
};

export type EscopoSetor = {
  setorId: string;
  setorNome: string;
  sku: string;
};

export type QuantidadeDeSetor = {
  setorId: string | null;
  setorNome: string;
  quantidade: number | null;
};

export type ItemConsolidado = {
  sku: string;
  nome: string;
  grupo: string;
  unidadeBase: string;
  /** Soma dos setores. Nulo quando nenhum setor informou quantidade. */
  total: number | null;
  valorTotal: number | null;
  porSetor: QuantidadeDeSetor[];
  /** Setores que esperavam contar este item e não contaram. */
  setoresQueNaoContaram: string[];
  parcial: boolean;
};

export function situacaoDaData(andamento: AndamentoSetor[]): SituacaoData {
  if (andamento.length === 0) return "legada";
  return andamento.every((s) => s.situacao === "concluido") ? "completa" : "parcial";
}

export function setoresPendentes(andamento: AndamentoSetor[]): string[] {
  return andamento
    .filter((s) => s.situacao === "pendente")
    .map((s) => s.setorNome);
}

/** Texto pronto pro aviso de contagem parcial. Vazio quando não há o que avisar. */
export function avisoDeContagemParcial(andamento: AndamentoSetor[]): string {
  const pendentes = setoresPendentes(andamento);
  if (pendentes.length === 0) return "";
  return `Contagem parcial. Faltam: ${pendentes.join(" e ")}.`;
}

function somar(valores: (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v !== null);
  if (presentes.length === 0) return null;
  return Number(presentes.reduce((total, v) => total + v, 0).toFixed(3));
}

/** Junta as linhas de uma data num item por SKU, somando os setores e
 * guardando a abertura. `escopo` é o snapshot da data: é ele que diz quais
 * setores DEVIAM ter contado cada item, e não a designação de hoje. */
export function consolidarPorSku(
  itens: ItemInventario[],
  escopo: EscopoSetor[] = [],
): ItemConsolidado[] {
  const porSku = new Map<string, ItemInventario[]>();
  for (const item of itens) {
    const lista = porSku.get(item.sku);
    if (lista) lista.push(item);
    else porSku.set(item.sku, [item]);
  }

  const esperadosPorSku = new Map<string, EscopoSetor[]>();
  for (const linha of escopo) {
    const lista = esperadosPorSku.get(linha.sku);
    if (lista) lista.push(linha);
    else esperadosPorSku.set(linha.sku, [linha]);
  }

  const consolidados: ItemConsolidado[] = [];
  for (const [sku, linhas] of porSku) {
    const primeiro = linhas[0];
    const porSetor: QuantidadeDeSetor[] = linhas.map((linha) => ({
      setorId: linha.setorId ?? null,
      setorNome: linha.setorNome ?? "",
      quantidade: linha.quantidade,
    }));

    const contaram = new Set(
      linhas.map((linha) => linha.setorId).filter((id): id is string => Boolean(id)),
    );
    const setoresQueNaoContaram = (esperadosPorSku.get(sku) ?? [])
      .filter((esperado) => !contaram.has(esperado.setorId))
      .map((esperado) => esperado.setorNome);

    consolidados.push({
      sku,
      nome: primeiro.nome,
      grupo: primeiro.grupo,
      unidadeBase: primeiro.unidadeBase,
      total: somar(linhas.map((linha) => linha.quantidade)),
      valorTotal: somar(linhas.map((linha) => linha.total)),
      porSetor,
      setoresQueNaoContaram,
      parcial: setoresQueNaoContaram.length > 0,
    });
  }

  return consolidados;
}

/** Quantidade somada por SKU - o número que a Cotação usa como estoque atual. */
export function quantidadePorSku(
  itens: ItemInventario[],
): Map<string, number | null> {
  const mapa = new Map<string, number | null>();
  for (const consolidado of consolidarPorSku(itens)) {
    mapa.set(consolidado.sku, consolidado.total);
  }
  return mapa;
}

/** SKUs que algum setor do snapshot deixou de contar, com os nomes dos
 * setores que faltaram. Usado pra marcar o item na Cotação. */
export function skusIncompletos(
  itens: ItemInventario[],
  escopo: EscopoSetor[],
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const consolidado of consolidarPorSku(itens, escopo)) {
    if (consolidado.parcial) mapa.set(consolidado.sku, consolidado.setoresQueNaoContaram);
  }
  return mapa;
}
