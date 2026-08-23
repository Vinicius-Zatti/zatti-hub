import type {
  CamadaFicha,
  CanalPrecoFicha,
  ClassificacaoMargem,
  ComponenteFicha,
  ConfiguracaoFinanceira,
  CustoFicha,
  EtapaFicha,
  FichaTecnicaResumo,
  MargemContribuicao,
} from "@/lib/types";

/** Funções puras (sem I/O) de propósito - usadas tanto no servidor quanto em
 * componente client, não podem puxar nada de `lib/banco/*` nem `lib/sheets/*`
 * (arrastaria dependência de servidor pro bundle do navegador). */

export const CAMADA_LABEL: Record<CamadaFicha, string> = {
  PRE: "Pré-preparo",
  VEN: "Venda",
};

export const CLASSIFICACAO_TAG: Record<ClassificacaoMargem, { label: string; classe: string }> = {
  lucro_ajustado: { label: "Lucro Ajustado", classe: "bg-verde/10 text-verde" },
  abaixo_do_lucro: { label: "Abaixo do Lucro", classe: "bg-ambar/10 text-ambar" },
  prejuizo: { label: "Prejuízo", classe: "bg-vermelho/10 text-vermelho" },
};

/** Grupos de produto (ver `src/lib/skus/sugerir.ts`) que nunca entram numa
 * receita - limpeza e material de escritório não são insumo de ficha
 * técnica. Usado tanto pro seletor de componente quanto pra tabela de
 * Conversões, os dois não devem nem listar esses produtos. */
export const GRUPOS_FORA_DE_FICHA = new Set(["LIM", "OPE"]);

/** Toda quantidade de Ficha Técnica (rendimento, componente) mostra sempre
 * 3 casas decimais em português (vírgula) - nunca `{numero}` cru no JSX,
 * que sai em ponto e sem casa fixa (bug real: "0.9" em vez de "0,900"). */
export function formatarQuantidade(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export type GrupoFichasPorCategoria = {
  categoriaId: string;
  categoriaNome: string;
  fichas: FichaTecnicaResumo[];
};

/** Agrupa a listagem por categoria dentro de uma mesma camada (PRE ou VEN),
 * ordenado alfabeticamente - é como a tela de listagem mobile monta os
 * blocos de cards. */
export function agruparFichasPorCategoria(fichas: FichaTecnicaResumo[]): GrupoFichasPorCategoria[] {
  const grupos = new Map<string, GrupoFichasPorCategoria>();
  for (const ficha of fichas) {
    const existente = grupos.get(ficha.categoriaId);
    if (existente) {
      existente.fichas.push(ficha);
    } else {
      grupos.set(ficha.categoriaId, {
        categoriaId: ficha.categoriaId,
        categoriaNome: ficha.categoriaNome,
        fichas: [ficha],
      });
    }
  }
  return [...grupos.values()].sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR"));
}

/** Reordena depois de mover/excluir um item na UI (drag ou botão de subir/
 * descer) - reatribui `ordem` sequencial 0..n a partir da posição atual no
 * array, que é a única fonte de verdade da ordem durante a edição. */
export function reordenarComponentes(itens: ComponenteFicha[]): ComponenteFicha[] {
  return itens.map((item, indice) => ({ ...item, ordem: indice }));
}

export function reordenarEtapas(itens: EtapaFicha[]): EtapaFicha[] {
  return itens.map((item, indice) => ({ ...item, ordem: indice }));
}

/** Estimativa de custo ao vivo, enquanto a ficha ainda está sendo montada no
 * formulário (antes de salvar) - mesma lógica de `calcularCustoFicha` no
 * servidor, mas usando preços já resolvidos (produto direto, sub-receita já
 * com custo por unidade calculado) em vez de consultar o banco de novo. */
export function calcularCustoEstimado(
  componentes: Pick<ComponenteFicha, "tipo" | "produtoSku" | "fichaComponenteId" | "quantidade">[],
  custosPorProdutoSku: Map<string, number | null>,
  custosPorFichaId: Map<string, number | null>,
  rendimentoQuantidade: number,
): CustoFicha {
  if (componentes.length === 0) return { custoTotal: null, custoPorUnidade: null, completo: false };

  let total = 0;
  let completo = true;
  for (const c of componentes) {
    const custoUnitario =
      c.tipo === "produto" ? (custosPorProdutoSku.get(c.produtoSku ?? "") ?? null) : (custosPorFichaId.get(c.fichaComponenteId ?? "") ?? null);
    if (custoUnitario === null) {
      completo = false;
      continue;
    }
    total += custoUnitario * c.quantidade;
  }

  return {
    custoTotal: total,
    custoPorUnidade: rendimentoQuantidade > 0 ? total / rendimentoQuantidade : null,
    completo,
  };
}

/** Indicadores da Calculadora de Margem Ideal - `null` nos que dependem de
 * faturamento quando ele é 0 (nada pra dividir ainda, não é erro).
 * `deducoesTotal` (taxa de pagamento + imposto) não depende de faturamento,
 * por isso nunca é null. */
export function calcularMargemContribuicao(config: ConfiguracaoFinanceira): MargemContribuicao {
  const { faturamentoMedioMensal, custoFixoMedioMensal, lucroDesejadoValor, taxaPagamento, aliquotaImposto } = config;
  const deducoesTotal = (taxaPagamento ?? 0) + (aliquotaImposto ?? 0);
  if (faturamentoMedioMensal <= 0) {
    return {
      percentualCustoFixo: null,
      lucroDesejadoPercentual: null,
      margemPontoEquilibrio: null,
      margemNecessaria: null,
      deducoesTotal,
    };
  }
  const percentualCustoFixo = custoFixoMedioMensal / faturamentoMedioMensal;
  const lucroDesejadoPercentual = lucroDesejadoValor / faturamentoMedioMensal;
  return {
    percentualCustoFixo,
    lucroDesejadoPercentual,
    margemPontoEquilibrio: percentualCustoFixo,
    margemNecessaria: percentualCustoFixo + lucroDesejadoPercentual,
    deducoesTotal,
  };
}

/** CMV = quanto do preço de venda é consumido pelo custo do insumo, em %.
 * `null` sem preço de venda ou preço zerado (nada pra dividir). */
export function calcularCmv(custoInsumos: number, precoVenda: number | null): number | null {
  if (precoVenda === null || precoVenda <= 0) return null;
  return (custoInsumos / precoVenda) * 100;
}

/** Margem de contribuição real do produto - preço de venda menos CMV menos
 * as deduções (taxa de pagamento + imposto, que também incidem sobre o
 * preço de venda). Fração (0,45 = 45%), não percentual. */
export function calcularMargemProduto(
  custoInsumos: number | null,
  precoVenda: number | null,
  deducoesTotal: number,
): number | null {
  if (custoInsumos === null || precoVenda === null || precoVenda <= 0) return null;
  return 1 - custoInsumos / precoVenda - deducoesTotal;
}

/** Preço que faz o CMV representar exatamente `1 - margem necessária -
 * deduções` do preço de venda - ex: margem necessária 50% + deduções 13%
 * -> CMV alvo 37% -> preço = custo / 0,37. `null` sem custo, sem margem
 * calculada, ou alvo <= 0 (deduções+margem somam 100% ou mais, impossível
 * bater com preço nenhum). */
export function calcularPrecoVendaSugerido(
  custoInsumos: number | null,
  margemNecessaria: number | null,
  deducoesTotal: number,
): number | null {
  if (custoInsumos === null || margemNecessaria === null) return null;
  const cmvAlvo = 1 - margemNecessaria - deducoesTotal;
  if (cmvAlvo <= 0) return null;
  return custoInsumos / cmvAlvo;
}

/** Etiqueta ao lado do preço de venda - compara a margem real do produto
 * contra a margem necessária (lucro batido) e a margem de ponto de
 * equilíbrio (só cobre custo fixo, sem lucro). Só usada no Salão - os canais
 * de delivery usam `classificarMargemContribuicaoValor` (ver por quê no
 * comentário de `montarPrecosPorCanal`). */
export function classificarMargemProduto(
  margemProduto: number | null,
  margemNecessaria: number | null,
  margemPontoEquilibrio: number | null,
): ClassificacaoMargem | null {
  if (margemProduto === null || margemNecessaria === null || margemPontoEquilibrio === null) return null;
  if (margemProduto >= margemNecessaria) return "lucro_ajustado";
  if (margemProduto >= margemPontoEquilibrio) return "abaixo_do_lucro";
  return "prejuizo";
}

/** Preço que entrega exatamente `margemContribuicaoValorAlvo` reais de
 * margem de contribuição, dado o custo do canal e sua dedução - versão em
 * valor absoluto de `calcularPrecoVendaSugerido`, usada nos canais de
 * delivery (ver `montarPrecosPorCanal`). `null` sem custo, sem meta em R$,
 * ou dedução >= 100% (preço nenhum cobre isso). */
export function calcularPrecoVendaSugeridoPorValor(
  custoInsumos: number | null,
  margemContribuicaoValorAlvo: number | null,
  deducoesTotal: number,
): number | null {
  if (custoInsumos === null || margemContribuicaoValorAlvo === null) return null;
  const fatorLiquido = 1 - deducoesTotal;
  if (fatorLiquido <= 0) return null;
  return (custoInsumos + margemContribuicaoValorAlvo) / fatorLiquido;
}

/** Etiqueta em valor absoluto - mesma ideia de `classificarMargemProduto`,
 * mas comparando reais de margem de contribuição contra os dois alvos em
 * reais, não porcentagem contra porcentagem. */
export function classificarMargemContribuicaoValor(
  margemContribuicaoValor: number | null,
  margemNecessariaValor: number | null,
  margemPontoEquilibrioValor: number | null,
): ClassificacaoMargem | null {
  if (margemContribuicaoValor === null || margemNecessariaValor === null || margemPontoEquilibrioValor === null) return null;
  if (margemContribuicaoValor >= margemNecessariaValor) return "lucro_ajustado";
  if (margemContribuicaoValor >= margemPontoEquilibrioValor) return "abaixo_do_lucro";
  return "prejuizo";
}

/** As 4 linhas da seção "Preços por Canal" de uma ficha de Venda.
 *
 * Salão mira uma margem de contribuição em **porcentagem** do preço (a
 * margem necessária/ponto de equilíbrio configuradas na Calculadora de
 * Margem Ideal) - isso é o que sempre foi.
 *
 * Delivery Próprio, iFood e 99Food NÃO repetem essa mesma porcentagem -
 * dedução de delivery (imposto + comissão do marketplace) é bem maior que a
 * do Salão (taxa de pagamento + imposto), e ainda soma o custo da
 * embalagem. Mirar a mesma porcentagem nessas condições infla o preço
 * sugerido a um valor impraticável (achado real: cliente via um número tão
 * alto que ficava sem referência nenhuma pra decidir o preço).
 *
 * Em vez disso, delivery mira o mesmo valor **em reais** de margem de
 * contribuição que o Salão obtém no preço sugerido dele - a pessoa ganha o
 * mesmo tanto de dinheiro por unidade vendida, em qualquer canal, cobrindo
 * o custo (com embalagem) e a dedução mais alta de cada um. Esse alvo em R$
 * (e o de ponto de equilíbrio, mesma lógica) também vira a régua da
 * "Situação" nesses 3 canais - continuar comparando por porcentagem ali
 * mostraria "Abaixo do Lucro" num preço que já está exatamente on-target,
 * só porque a fração dele é naturalmente menor que a do Salão.
 *
 * `custoComEmbalagem` null (sem Componentes Delivery cadastrados) cai pro
 * mesmo custo do Salão nos 3 canais de delivery. Preço sugerido/Situação de
 * delivery dependem do preço sugerido do Salão ter saído (custo do insumo +
 * margem necessária/ponto de equilíbrio configurados) - não dependem do
 * Salão ter preço de venda praticado, então cliente sem canal de Salão
 * nenhum (só delivery) não fica bloqueado. */
export function montarPrecosPorCanal(params: {
  custoBase: number | null;
  custoComEmbalagem: number | null;
  precoVendaSalao: number | null;
  precoVendaDeliveryProprio: number | null;
  precoVendaIfood: number | null;
  precoVenda99Food: number | null;
  margemNecessaria: number | null;
  margemPontoEquilibrio: number | null;
  deducoesSalao: number;
  deducoesIfood: number;
  deducoes99Food: number;
}): CanalPrecoFicha[] {
  const custoDelivery = params.custoComEmbalagem ?? params.custoBase;

  const precoSugeridoSalao = calcularPrecoVendaSugerido(params.custoBase, params.margemNecessaria, params.deducoesSalao);
  const margemNecessariaValor =
    params.margemNecessaria !== null && precoSugeridoSalao !== null ? params.margemNecessaria * precoSugeridoSalao : null;
  const margemPontoEquilibrioValor =
    params.margemPontoEquilibrio !== null && precoSugeridoSalao !== null ? params.margemPontoEquilibrio * precoSugeridoSalao : null;

  const linhas: { canal: CanalPrecoFicha["canal"]; label: string; custo: number | null; precoPraticado: number | null; deducoes: number }[] = [
    { canal: "salao", label: "Salão", custo: params.custoBase, precoPraticado: params.precoVendaSalao, deducoes: params.deducoesSalao },
    {
      canal: "delivery_proprio",
      label: "Delivery Próprio",
      custo: custoDelivery,
      precoPraticado: params.precoVendaDeliveryProprio,
      deducoes: params.deducoesSalao,
    },
    { canal: "ifood", label: "iFood", custo: custoDelivery, precoPraticado: params.precoVendaIfood, deducoes: params.deducoesIfood },
    {
      canal: "99food",
      label: "99Food",
      custo: custoDelivery,
      precoPraticado: params.precoVenda99Food,
      deducoes: params.deducoes99Food,
    },
  ];

  return linhas.map((l) => {
    const margemProduto = calcularMargemProduto(l.custo, l.precoPraticado, l.deducoes);
    const margemContribuicaoValor = margemProduto !== null && l.precoPraticado !== null ? margemProduto * l.precoPraticado : null;

    if (l.canal === "salao") {
      return {
        canal: l.canal,
        label: l.label,
        custoPorUnidade: l.custo,
        precoSugerido: precoSugeridoSalao,
        precoPraticado: l.precoPraticado,
        classificacao: classificarMargemProduto(margemProduto, params.margemNecessaria, params.margemPontoEquilibrio),
        margemContribuicaoValor,
      };
    }

    return {
      canal: l.canal,
      label: l.label,
      custoPorUnidade: l.custo,
      precoSugerido: calcularPrecoVendaSugeridoPorValor(l.custo, margemNecessariaValor, l.deducoes),
      precoPraticado: l.precoPraticado,
      classificacao: classificarMargemContribuicaoValor(margemContribuicaoValor, margemNecessariaValor, margemPontoEquilibrioValor),
      margemContribuicaoValor,
    };
  });
}
