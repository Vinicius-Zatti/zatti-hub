import { ultimoDiaDoMes } from "./datas";
import { calcularDre, lancamentosDaDre } from "./dre";
import { somarValores } from "./parcelas";
import type { CategoriaFinanceira, LancamentoBase } from "./tipos";

/** Farol por ritmo do Painel M.E.G.A. (decisão 4 de Vinícius, 13/10/2026).
 * Enquanto o CMV do mês é provisório (sem inventário), o acompanhamento
 * compara o gasto já lançado com a meta proporcional aos dias decorridos:
 * esperado = meta do mês x dias decorridos / dias do mês (ritmo diário, padrão
 * de 17h20). Acima do ritmo = amarelo; mais de 20% acima = vermelho (16h).
 * Gasto conta pela data de competência (a data da compra). Freelancer entra
 * nos custos variáveis. Folha fixa não se divide. Sem meta cadastrada, sem cor.
 * Nenhuma fórmula da DRE muda: o realizado sai de `calcularDre` com os
 * lançamentos cortados em hoje. */

export const LIMITE_VERMELHO_RITMO = 0.2;

export type FarolRitmo = "no_ritmo" | "acima_do_ritmo" | "muito_acima_do_ritmo" | "sem_meta" | "mes_nao_comecou";

export type FracaoDoMes = { diasDecorridos: number; diasDoMes: number; fracao: number };

/** Só o que o ritmo lê da meta da unidade. */
export type MetaRitmo = { faturamento: number | null; cmvPercentual: number | null; custosVariaveis: number | null };

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Fração do mês já decorrida, por dia, no calendário de `hoje` ("AAAA-MM-DD",
 * já no fuso de Brasília). Mês corrente: dia de hoje ÷ dias do mês (hoje conta,
 * porque a compra de hoje já entrou). Mês anterior ainda aberto: 1 (esperado
 * = meta inteira). Mês futuro: 0 (sem ritmo). Só strings ISO, nunca `Date`. */
export function fracaoDecorrida(hoje: string, competencia: string): FracaoDoMes {
  const [ano, mes] = competencia.split("-").map(Number);
  const diasDoMes = ultimoDiaDoMes(ano, mes - 1);
  const mesDeHoje = hoje.slice(0, 7);
  if (competencia < mesDeHoje) return { diasDecorridos: diasDoMes, diasDoMes, fracao: 1 };
  if (competencia > mesDeHoje) return { diasDecorridos: 0, diasDoMes, fracao: 0 };
  const dia = Number(hoje.slice(8, 10));
  const diasDecorridos = Number.isInteger(dia) && dia >= 1 ? Math.min(dia, diasDoMes) : diasDoMes;
  return { diasDecorridos, diasDoMes, fracao: diasDecorridos / diasDoMes };
}

/** Até este valor é amarelo; acima, vermelho. Em centavos, igual ao que a tela mostra. */
export function limiteVermelho(esperado: number): number {
  return arredondar2(esperado * (1 + LIMITE_VERMELHO_RITMO));
}

export function calcularFarolRitmo(realizado: number, esperado: number | null, fracao: number): FarolRitmo {
  if (esperado === null) return "sem_meta";
  if (fracao <= 0) return "mes_nao_comecou";
  if (realizado <= esperado) return "no_ritmo";
  if (realizado <= limiteVermelho(esperado)) return "acima_do_ritmo";
  return "muito_acima_do_ritmo";
}

export type IndicadorRitmo = {
  /** Lançado até hoje pela data de competência (cancelados e liquidação de provisão fora, como na DRE). */
  realizado: number;
  /** Meta do mês inteiro em R$; null = sem meta. */
  metaDoMes: number | null;
  /** metaDoMes x fração decorrida, em centavos. */
  esperado: number | null;
  /** esperado x 1,2: até aqui é amarelo; acima, vermelho. */
  limiteVermelho: number | null;
  farol: FarolRitmo;
};

function indicador(realizado: number, metaDoMes: number | null, fracao: number): IndicadorRitmo {
  const esperado = metaDoMes === null ? null : arredondar2(metaDoMes * fracao);
  return {
    realizado,
    metaDoMes,
    esperado,
    limiteVermelho: esperado === null ? null : limiteVermelho(esperado),
    farol: calcularFarolRitmo(realizado, esperado, fracao),
  };
}

export type RitmoDoMes = FracaoDoMes & {
  hoje: string;
  /** Compras do CMC (mercadorias + embalagens). Meta do mês = faturamento x % CMV das metas. */
  cmvCompras: IndicadorRitmo & { comprasMercadorias: number; comprasEmbalagens: number };
  /** Subgrupo Custos de Venda Variáveis + conta Freelancers (na DRE ela fica no CMO). */
  custosVariaveis: IndicadorRitmo & { custosVendaVariaveis: number; freelancers: number };
};

/** Meta de CMV de compras em R$ no mês = faturamento mínimo x % CMV máximo
 * (exemplo de Vinícius: 100 mil x 30% = 30 mil). Precisa das duas. */
export function metaCmvComprasDoMes(meta: MetaRitmo | null): number | null {
  if (!meta || meta.faturamento === null || meta.cmvPercentual === null) return null;
  return arredondar2(meta.faturamento * meta.cmvPercentual);
}

export function montarRitmoDoMes(params: {
  competencia: string;
  hoje: string;
  lancamentos: LancamentoBase[];
  categorias: CategoriaFinanceira[];
  meta: MetaRitmo | null;
}): RitmoDoMes {
  const { competencia, hoje, lancamentos, categorias, meta } = params;
  const fracaoDoMes = fracaoDecorrida(hoje, competencia);
  // Mesma montagem da DRE (parcela cancelada e liquidação de provisão fora), só
  // com o corte pela data de competência <= hoje: compra lançada para depois de
  // hoje (recorrência, lançamento futuro) ainda não conta no ritmo.
  const ateHoje = lancamentosDaDre(lancamentos).filter((l) => l.dataCompetencia <= hoje);
  const dre = calcularDre({ competencia, lancamentos: ateHoje, categorias, estoqueMensal: null });

  const idSubgrupoVariaveis = categorias.find((c) => c.nivel === "subgrupo" && c.codigoSistema === "custos_venda_variaveis")?.id;
  const custosVendaVariaveis = dre.deducoes.subgrupos.find((sg) => sg.id === idSubgrupoVariaveis)?.total ?? 0;
  // Só a conta de sistema `cmo_freelancers`; uma conta própria com outro nome fica na folha.
  const idsFreelancers = new Set(categorias.filter((c) => c.nivel === "conta" && c.codigoSistema === "cmo_freelancers").map((c) => c.id));
  const freelancers = somarValores(dre.cmo.contas.filter((c) => idsFreelancers.has(c.id)).map((c) => c.valor));

  return {
    hoje,
    ...fracaoDoMes,
    cmvCompras: {
      ...indicador(dre.cmv.cmc, metaCmvComprasDoMes(meta), fracaoDoMes.fracao),
      comprasMercadorias: dre.cmv.comprasMercadorias,
      comprasEmbalagens: dre.cmv.comprasEmbalagens,
    },
    custosVariaveis: {
      ...indicador(somarValores([custosVendaVariaveis, freelancers]), meta?.custosVariaveis ?? null, fracaoDoMes.fracao),
      custosVendaVariaveis,
      freelancers,
    },
  };
}
