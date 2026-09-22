import { competenciaDoMes, saldoAntesDe, type MovimentoCaixa } from "./caixa";
import { ultimoDiaDoMes } from "./datas";
import type { LinhaDreAnual } from "./dre-anual";
import { somarValores } from "./parcelas";
import type { CategoriaFinanceira, PapelDre } from "./tipos";

/** Fluxo de Caixa mensal e DFC usam a mesma tabela anual da DRE
 * (`LinhaDreAnual` + setas por grupo). Diferença: aqui não existe mês
 * "pendente" - caixa é sempre um número, mês futuro também (projetado). */

function arredondar2(v: number): number {
  return Math.round(v * 100) / 100;
}

function linhaFluxo(id: string, rotulo: string, nivel: 0 | 1 | 2, valores: number[], divisorMedia: number | null, extras?: Partial<LinhaDreAnual>): LinhaDreAnual {
  const total = somarValores(valores);
  return {
    id,
    rotulo,
    nivel,
    valoresPorMes: valores,
    total,
    media: divisorMedia ? arredondar2(total / divisorMedia) : null,
    ...extras,
  };
}

/** Linha de saldo: Total = saldo do primeiro mês (saldo inicial) ou do
 * último (saldo final); saldo nunca tem Média. */
function linhaSaldo(id: string, rotulo: string, valores: number[], ponta: "inicio" | "fim"): LinhaDreAnual {
  return {
    id,
    rotulo,
    nivel: 0,
    destaque: true,
    valoresPorMes: valores,
    total: ponta === "inicio" ? valores[0] : valores[valores.length - 1],
    media: null,
  };
}

/** Soma por mês (12 posições) dos movimentos que passam no filtro. `sinal`
 * -1 vira saída em valor positivo (mesma convenção da DRE: "(-) Custos" com
 * número positivo). */
function somaMensal(movimentos: MovimentoCaixa[], ano: number, filtro: (m: MovimentoCaixa) => boolean, sinal: 1 | -1): number[] {
  const valores = Array.from({ length: 12 }, () => 0);
  for (const m of movimentos) {
    if (!m.data.startsWith(`${ano}-`) || !filtro(m)) continue;
    const mes = Number(m.data.slice(5, 7)) - 1;
    valores[mes] = arredondar2(valores[mes] + sinal * m.valor);
  }
  return valores;
}

function saldosIniciaisDoAno(saldoBase: number, movimentos: MovimentoCaixa[], ano: number): number[] {
  return Array.from({ length: 12 }, (_, i) => saldoAntesDe(saldoBase, movimentos, `${competenciaDoMes(ano, i)}-01`));
}

function temValor(linha: LinhaDreAnual): boolean {
  return linha.valoresPorMes.some((v) => v !== null && v !== 0);
}

function raizDe(categoriaId: string, porId: Map<string, CategoriaFinanceira>): CategoriaFinanceira | undefined {
  let atual = porId.get(categoriaId);
  while (atual?.parentId) atual = porId.get(atual.parentId);
  return atual;
}

function contasOrdenadas(categorias: CategoriaFinanceira[], filtro: (c: CategoriaFinanceira) => boolean): CategoriaFinanceira[] {
  return categorias.filter((c) => c.nivel === "conta" && filtro(c)).sort((a, b) => a.ordem - b.ordem);
}

function linhasDeContas(contas: CategoriaFinanceira[], movimentos: MovimentoCaixa[], ano: number, sinal: 1 | -1, nivel: 1 | 2, divisor: number | null): LinhaDreAnual[] {
  return contas
    .map((c) => linhaFluxo(c.id, c.nome, nivel, somaMensal(movimentos, ano, (m) => m.categoriaId === c.id, sinal), divisor))
    .filter(temValor);
}

function somarLinhas(linhas: LinhaDreAnual[]): number[] {
  return Array.from({ length: 12 }, (_, i) => somarValores(linhas.map((l) => l.valoresPorMes[i] ?? 0)));
}

/** Fluxo de Caixa mensal (ano inteiro): Saldo inicial, Entradas por conta,
 * Saídas por grupo principal e conta, Saldo do mês, Saldo final. Conta sem
 * movimento no ano não aparece (a DRE mostra todas; o caixa mostra o que
 * mexeu). */
export function montarFluxoMensal(params: {
  ano: number;
  movimentos: MovimentoCaixa[];
  categorias: CategoriaFinanceira[];
  saldoBase: number;
  divisorMedia: number | null;
}): LinhaDreAnual[] {
  const { ano, movimentos, categorias, saldoBase, divisorMedia } = params;
  const porId = new Map(categorias.map((c) => [c.id, c]));

  const entradasFilhos = linhasDeContas(
    contasOrdenadas(categorias, (c) => c.papelDre === "receita"),
    movimentos.filter((m) => m.tipo === "receita"),
    ano,
    1,
    1,
    divisorMedia,
  );
  const entradas = somaMensal(movimentos, ano, (m) => m.tipo === "receita", 1);

  const saidasMov = movimentos.filter((m) => m.tipo === "despesa");
  const grupos = categorias.filter((c) => c.nivel === "grupo_principal" && c.papelDre !== "receita").sort((a, b) => a.ordem - b.ordem);
  const saidasFilhos = grupos
    .map((g) => {
      const contasDoGrupo = contasOrdenadas(categorias, (c) => raizDe(c.id, porId)?.id === g.id);
      const filhos = linhasDeContas(contasDoGrupo, saidasMov, ano, -1, 2, divisorMedia);
      return linhaFluxo(g.id, g.nome, 1, somarLinhas(filhos), divisorMedia, { filhos });
    })
    .filter(temValor);
  const saidas = somaMensal(movimentos, ano, (m) => m.tipo === "despesa", -1);

  const saldoMes = entradas.map((e, i) => arredondar2(e - saidas[i]));
  const iniciais = saldosIniciaisDoAno(saldoBase, movimentos, ano);
  const finais = iniciais.map((s, i) => arredondar2(s + saldoMes[i]));

  return [
    linhaSaldo("saldo_inicial", "Saldo inicial", iniciais, "inicio"),
    linhaFluxo("entradas", "(+) Entradas", 0, entradas, divisorMedia, { filhos: entradasFilhos }),
    linhaFluxo("saidas", "(-) Saídas", 0, saidas, divisorMedia, { filhos: saidasFilhos }),
    linhaFluxo("saldo_mes", "= Saldo do mês", 0, saldoMes, divisorMedia, { destaque: true }),
    linhaSaldo("saldo_final", "= Saldo final", finais, "fim"),
  ];
}

export type LinhaFluxoDiario = {
  data: string;
  entradas: number;
  saidas: number;
  saldoDia: number;
  saldoAcumulado: number;
};

/** Fluxo diário de um mês: uma linha por dia, saldo acumulado a partir do
 * saldo do começo do mês. */
export function montarFluxoDiario(params: { ano: number; mesIndice0: number; movimentos: MovimentoCaixa[]; saldoBase: number }): {
  saldoInicial: number;
  dias: LinhaFluxoDiario[];
} {
  const { ano, mesIndice0, movimentos, saldoBase } = params;
  const prefixo = competenciaDoMes(ano, mesIndice0);
  const saldoInicial = saldoAntesDe(saldoBase, movimentos, `${prefixo}-01`);
  let acumulado = saldoInicial;
  const dias: LinhaFluxoDiario[] = [];
  for (let dia = 1; dia <= ultimoDiaDoMes(ano, mesIndice0); dia++) {
    const data = `${prefixo}-${String(dia).padStart(2, "0")}`;
    const doDia = movimentos.filter((m) => m.data === data);
    const entradas = somarValores(doDia.filter((m) => m.valor > 0).map((m) => m.valor));
    const saidas = somarValores(doDia.filter((m) => m.valor < 0).map((m) => -m.valor));
    const saldoDia = arredondar2(entradas - saidas);
    acumulado = arredondar2(acumulado + saldoDia);
    dias.push({ data, entradas, saidas, saldoDia, saldoAcumulado: acumulado });
  }
  return { saldoInicial, dias };
}

// ── DFC (método direto) ────────────────────────────────────────────────────

type BlocoOperacional = { id: string; rotulo: string; papeis: PapelDre[] };

const BLOCOS_PAGAMENTO_OPERACIONAL: BlocoOperacional[] = [
  { id: "dfc_deducoes", rotulo: "Deduções e custos variáveis de venda", papeis: ["deducao_receita", "custo_venda_variavel"] },
  { id: "dfc_cmc", rotulo: "Compras - CMC", papeis: ["cmc_mercadorias", "cmc_embalagens"] },
  { id: "dfc_cmo", rotulo: "Mão de obra - CMO", papeis: ["cmo", "cmo_ferias", "cmo_decimo_terceiro", "cmo_multa_fgts"] },
  {
    id: "dfc_custos_operacionais",
    rotulo: "Custos operacionais",
    papeis: ["custo_ocupacao", "custo_administrativo", "custo_comercial", "custo_venda_fixo"],
  },
];

/** Única Saída Não Operacional que é investimento; as demais (retiradas,
 * principal de empréstimo, outras e as criadas pelo cliente) são
 * financiamento - decidido na arquitetura de 22/09, ajustável depois do teste. */
export function naturezaSaidaNaoOperacional(categoria: CategoriaFinanceira): "investimento" | "financiamento" {
  return categoria.codigoSistema === "sno_equipamentos_investimentos" ? "investimento" : "financiamento";
}

export function montarDfcAnual(params: {
  ano: number;
  movimentos: MovimentoCaixa[];
  categorias: CategoriaFinanceira[];
  saldoBase: number;
  divisorMedia: number | null;
}): LinhaDreAnual[] {
  const { ano, movimentos, categorias, saldoBase, divisorMedia } = params;

  const recebimentosFilhos = linhasDeContas(contasOrdenadas(categorias, (c) => c.papelDre === "receita"), movimentos, ano, 1, 1, divisorMedia);
  const recebimentos = somarLinhas(recebimentosFilhos);

  const blocos = BLOCOS_PAGAMENTO_OPERACIONAL.map((b) => {
    const filhos = linhasDeContas(
      contasOrdenadas(categorias, (c) => !!c.papelDre && b.papeis.includes(c.papelDre)),
      movimentos,
      ano,
      -1,
      2,
      divisorMedia,
    );
    return linhaFluxo(b.id, b.rotulo, 1, somarLinhas(filhos), divisorMedia, { filhos });
  }).filter(temValor);
  const pagamentos = somarLinhas(blocos);

  const caixaOperacional = recebimentos.map((r, i) => arredondar2(r - pagamentos[i]));

  const sno = contasOrdenadas(categorias, (c) => c.papelDre === "saida_nao_operacional");
  const investimentoFilhos = linhasDeContas(sno.filter((c) => naturezaSaidaNaoOperacional(c) === "investimento"), movimentos, ano, -1, 1, divisorMedia);
  const financiamentoFilhos = linhasDeContas(sno.filter((c) => naturezaSaidaNaoOperacional(c) === "financiamento"), movimentos, ano, -1, 1, divisorMedia);
  const investimento = somarLinhas(investimentoFilhos);
  const financiamento = somarLinhas(financiamentoFilhos);

  const geracao = caixaOperacional.map((c, i) => arredondar2(c - investimento[i] - financiamento[i]));
  const iniciais = saldosIniciaisDoAno(saldoBase, movimentos, ano);
  const finais = iniciais.map((s, i) => arredondar2(s + geracao[i]));

  return [
    linhaSaldo("saldo_inicial", "Saldo inicial", iniciais, "inicio"),
    linhaFluxo("recebimentos", "(+) Recebimentos operacionais", 0, recebimentos, divisorMedia, { filhos: recebimentosFilhos }),
    linhaFluxo("pagamentos", "(-) Pagamentos operacionais", 0, pagamentos, divisorMedia, { filhos: blocos }),
    linhaFluxo("caixa_operacional", "= Caixa líquido das atividades operacionais", 0, caixaOperacional, divisorMedia, { destaque: true }),
    linhaFluxo("investimento", "(-) Atividades de investimento", 0, investimento, divisorMedia, { filhos: investimentoFilhos }),
    linhaFluxo("financiamento", "(-) Atividades de financiamento", 0, financiamento, divisorMedia, { filhos: financiamentoFilhos }),
    linhaFluxo("geracao_caixa", "= Geração de caixa após Saídas Não Operacionais", 0, geracao, divisorMedia, { destaque: true }),
    linhaSaldo("saldo_final", "= Saldo final", finais, "fim"),
  ];
}

/** Conciliação informativa da DFC: provisões constituídas no mês (efeito na
 * DRE, zero efeito no caixa). Nunca soma no saldo - só explica a diferença
 * entre resultado e caixa. */
export function montarConciliacaoProvisoes(params: {
  ano: number;
  provisaoPorMes: (competencia: string) => Record<"ferias" | "decimo_terceiro" | "multa_fgts", number> | null;
  divisorMedia: number | null;
}): LinhaDreAnual[] {
  const { ano, provisaoPorMes, divisorMedia } = params;
  const valores = (tipo: "ferias" | "decimo_terceiro" | "multa_fgts") =>
    Array.from({ length: 12 }, (_, i) => provisaoPorMes(competenciaDoMes(ano, i))?.[tipo] ?? 0);
  const filhos = [
    linhaFluxo("conc_ferias", "Provisão de férias (com 1/3 e encargos)", 1, valores("ferias"), divisorMedia),
    linhaFluxo("conc_13", "Provisão de 13º salário (com encargos)", 1, valores("decimo_terceiro"), divisorMedia),
    linhaFluxo("conc_multa", "Provisão de multa do FGTS", 1, valores("multa_fgts"), divisorMedia),
  ];
  return [
    linhaFluxo("conciliacao_provisoes", "Provisões constituídas (sem efeito caixa)", 0, somarLinhas(filhos), divisorMedia, { filhos, destaque: true }),
  ];
}
