import { datasDeContagem, itensSemValor, valorContagem } from "@/lib/cmv";
import type { AndamentoSetor, ModalidadeContagem } from "@/lib/contagem/setor";
import { GRUPOS_INSUMO } from "@/lib/skus/montar";
import type { ItemInventario } from "@/lib/types";

/** Sugestão de estoque final do mês vinda da Contagem (Fase 3, item 2, 13/10).
 * Nada aqui é fórmula nova: a data elegível é a mesma régua da Calculadora de
 * CMV (`datasDeContagem`: legada, ou por setor com todos os setores
 * concluídos), o valor é o mesmo da Contagem > Visualização
 * (`valorContagem`) e os itens sem valor são os mesmos que a Calculadora
 * avisa (`itensSemValor`). Desde a decisão 5 de Vinícius (13/10, 16h) a
 * sugestão separa embalagens (grupo EMB do padrão de SKU Zatti) de
 * mercadorias (todo o resto). A sugestão nunca grava: a pessoa usa e salva. */
export type SugestaoEstoqueContagem = {
  /** "DD/MM/AAAA", como a Contagem grava. */
  data: string;
  /** Soma de todos os itens que não são embalagem (inclui os sem grupo reconhecido). */
  mercadorias: number;
  /** Soma dos itens do grupo EMB (embalagens de venda). */
  embalagens: number;
  /** Itens contados sem valor (sem preço ou sem quantidade): o valor é parcial. */
  itensSemValor: number;
  /** Itens sem grupo reconhecível nem no SKU nem no cadastro: foram para Mercadorias. */
  itensSemGrupo: number;
};

const GRUPOS_CONHECIDOS = new Set([...GRUPOS_INSUMO, "PRE", "VEN"]);

/** Grupo do item pelo padrão de SKU Zatti: as 3 primeiras letras do SKU são o
 * grupo. Se não formam um grupo conhecido (SKU antigo, fora do padrão), vale o
 * grupo do cadastro; se nem ele é conhecido, `null` (sem grupo reconhecido). */
export function grupoDoItem(item: Pick<ItemInventario, "sku" | "grupo">): string | null {
  const prefixo = item.sku.trim().slice(0, 3).toUpperCase();
  if (GRUPOS_CONHECIDOS.has(prefixo)) return prefixo;
  const cadastro = (item.grupo ?? "").trim().toUpperCase();
  if (GRUPOS_CONHECIDOS.has(cadastro)) return cadastro;
  return null;
}

export function ehEmbalagem(item: Pick<ItemInventario, "sku" | "grupo">): boolean {
  return grupoDoItem(item) === "EMB";
}

/** "DD/MM/AAAA" -> "AAAA-MM" (vazio se a data não tiver o formato). */
function competenciaDaDataBr(data: string): string {
  const [dia, mes, ano] = data.split("/");
  if (!dia || !mes || !ano) return "";
  return `${ano}-${mes.padStart(2, "0")}`;
}

/** Contagem elegível mais próxima do fim do mês `competencia` ("AAAA-MM"),
 * com data dentro do mês. `null` = nenhuma contagem completa no mês. */
export function sugestaoEstoqueDoMes(params: {
  competencia: string;
  itens: ItemInventario[];
  andamentoPorData: Map<string, AndamentoSetor[]>;
  modalidadePorData: Map<string, ModalidadeContagem>;
}): SugestaoEstoqueContagem | null {
  const { competencia, itens, andamentoPorData, modalidadePorData } = params;
  return escolherDoMes(competencia, itens, datasDeContagem(itens, andamentoPorData, modalidadePorData));
}

/** `datasElegiveis` vem de `datasDeContagem`, da mais recente para a mais antiga. */
function escolherDoMes(competencia: string, itens: ItemInventario[], datasElegiveis: string[]): SugestaoEstoqueContagem | null {
  const data = datasElegiveis.find((d) => competenciaDaDataBr(d) === competencia);
  if (!data) return null;
  return {
    data,
    mercadorias: valorContagem(itens.filter((it) => !ehEmbalagem(it)), data),
    embalagens: valorContagem(itens.filter(ehEmbalagem), data),
    itensSemValor: itensSemValor(itens, data),
    itensSemGrupo: itens.filter((it) => it.data === data && grupoDoItem(it) === null).length,
  };
}

/** As 12 sugestões do ano (índice 0 = janeiro), na ordem da grade de Dados
 * Complementares da DRE. */
export function sugestoesEstoqueDoAno(params: {
  ano: number;
  itens: ItemInventario[];
  andamentoPorData: Map<string, AndamentoSetor[]>;
  modalidadePorData: Map<string, ModalidadeContagem>;
}): (SugestaoEstoqueContagem | null)[] {
  const { ano, itens, andamentoPorData, modalidadePorData } = params;
  const datasElegiveis = datasDeContagem(itens, andamentoPorData, modalidadePorData);
  return Array.from({ length: 12 }, (_, indice) =>
    escolherDoMes(`${ano}-${String(indice + 1).padStart(2, "0")}`, itens, datasElegiveis),
  );
}
