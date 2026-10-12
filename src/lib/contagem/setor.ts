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

/** Modalidade gravada no cabeçalho da contagem (`contagens.modalidade`). */
export type ModalidadeContagem = "legada" | "setor";

export type AndamentoSetor = {
  setorId: string;
  setorNome: string;
  situacao: SituacaoSetor;
  enviadoEm: string | null;
  enviadoPor: string | null;
  /** Trava otimista do envio do setor: quem reenvia ou corrige manda a
   * versão que viu, e o banco recusa se outra pessoa enviou antes. */
  versao?: number;
};

export type EscopoSetor = {
  setorId: string;
  setorNome: string;
  sku: string;
  /** Metadados congelados na abertura. A lista da tela vem daqui, não do
   * cadastro atual: produto desativado depois continua na lista da data. */
  nome?: string;
  grupo?: string;
  unidadeBase?: string;
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

/** Sem `modalidade` (unidade na planilha), data sem andamento é legada.
 * Com a modalidade do cabeçalho, quem manda é ela: contagem por setor aberta
 * com snapshot vazio não tem como estar completa e nunca vira "legada". */
export function situacaoDaData(
  andamento: AndamentoSetor[],
  modalidade?: ModalidadeContagem,
): SituacaoData {
  if (modalidade === "legada") return "legada";
  if (andamento.length === 0) return modalidade === "setor" ? "parcial" : "legada";
  return andamento.every((s) => s.situacao === "concluido") ? "completa" : "parcial";
}

export function setoresPendentes(andamento: AndamentoSetor[]): string[] {
  return andamento
    .filter((s) => s.situacao === "pendente")
    .map((s) => s.setorNome);
}

/** Texto pronto pro aviso de contagem parcial. Vazio quando não há o que avisar. */
export function avisoDeContagemParcial(
  andamento: AndamentoSetor[],
  modalidade?: ModalidadeContagem,
): string {
  if (modalidade === "setor" && andamento.length === 0) {
    return "Contagem por setor aberta sem nenhum setor na lista.";
  }
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
 * setores DEVIAM ter contado cada item, e não a designação de hoje.
 *
 * Consolida a UNIÃO snapshot + itens: SKU do snapshot que ninguém contou
 * aparece como pendente (total nulo), e quantidade nula nunca vale como
 * "contado" - a soma conhecida é preservada e o item fica marcado parcial. */
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

  const skus = [...porSku.keys(), ...[...esperadosPorSku.keys()].filter((sku) => !porSku.has(sku))];

  const consolidados: ItemConsolidado[] = [];
  for (const sku of skus) {
    const linhas = porSku.get(sku) ?? [];
    const esperados = esperadosPorSku.get(sku) ?? [];
    const referencia = linhas[0];
    const porSetor: QuantidadeDeSetor[] = linhas.map((linha) => ({
      setorId: linha.setorId ?? null,
      setorNome: linha.setorNome ?? "",
      quantidade: linha.quantidade,
    }));

    // Só conta como "contou" quem informou quantidade de verdade.
    const contaram = new Set(
      linhas
        .filter((linha) => linha.quantidade !== null)
        .map((linha) => linha.setorId)
        .filter((id): id is string => Boolean(id)),
    );
    const faltaram = new Set<string>();
    for (const esperado of esperados) {
      if (!contaram.has(esperado.setorId)) faltaram.add(esperado.setorNome);
    }
    for (const linha of linhas) {
      if (linha.quantidade === null && !(linha.setorId && contaram.has(linha.setorId))) {
        faltaram.add(linha.setorNome || "sem setor");
      }
    }
    const setoresQueNaoContaram = [...faltaram];

    consolidados.push({
      sku,
      nome: referencia?.nome ?? esperados[0]?.nome ?? sku,
      grupo: referencia?.grupo ?? esperados[0]?.grupo ?? "",
      unidadeBase: referencia?.unidadeBase ?? esperados[0]?.unidadeBase ?? "",
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
