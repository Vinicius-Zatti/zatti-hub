import { aberturasDasContas, montarMovimentosCaixa, saldoAte } from "./caixa";
import { ultimoDiaDoMes } from "./datas";
import { somarValores } from "./parcelas";
import type { BaixaBase, ContaFinanceira, LancamentoBase, TipoLancamento } from "./tipos";

export type TituloEmAberto = {
  parcelaId: string;
  dataPrevista: string;
  tipo: TipoLancamento;
  descricao: string;
  categoriaId: string;
  parcela: string;
  valorAberto: number;
};

export type VisaoGeralFinanceira = {
  saldoRealizadoHoje: number;
  saldoProjetadoFimDoMes: number;
  aReceberNoMes: number;
  aPagarNoMes: number;
  vencidoAReceber: number;
  vencidoAPagar: number;
  proximosVencimentos: TituloEmAberto[];
  caixa30Dias: Caixa30Dias;
};

/** Caixa dos próximos dias para o Painel financeiro (20/10/2026). Parte do saldo realizado hoje (dinheiro
 * que existe) e soma só o que está em aberto, dia a dia: a pagar vencido entra como saída de hoje (precisa
 * ser pago); a receber vencido fica de fora (não dá para contar com ele). Baixa parcial já está descontada. */
export type Caixa30Dias = {
  dias: number;
  saldoHoje: number;
  entradas: number;
  saidas: number;
  vencidoAPagarHoje: number;
  saldoFinal: { data: string; valor: number };
  menorSaldo: { data: string; valor: number };
  /** Primeiro dia em que o saldo fica abaixo de zero; `null` = não fica no período. */
  primeiroNegativo: { data: string; valor: number } | null;
};

export function projetarCaixa(params: { hoje: string; saldoHoje: number; abertos: TituloEmAberto[]; dias?: number }): Caixa30Dias {
  const { hoje, saldoHoje, abertos, dias = 30 } = params;
  const fim = somarDias(hoje, dias);
  const vencidoAPagarHoje = somarValores(abertos.filter((t) => t.tipo === "despesa" && t.dataPrevista < hoje).map((t) => t.valorAberto));
  const noPeriodo = abertos.filter((t) => t.dataPrevista >= hoje && t.dataPrevista <= fim);
  const porDia = new Map<string, number>();
  for (const t of noPeriodo) {
    const delta = t.tipo === "receita" ? t.valorAberto : -t.valorAberto;
    porDia.set(t.dataPrevista, somarValores([porDia.get(t.dataPrevista) ?? 0, delta]));
  }
  let saldo = somarValores([saldoHoje, -vencidoAPagarHoje]);
  let menorSaldo = { data: hoje, valor: saldo };
  let primeiroNegativo: Caixa30Dias["primeiroNegativo"] = null;
  for (let d = 0; d <= dias; d++) {
    const data = somarDias(hoje, d);
    saldo = somarValores([saldo, porDia.get(data) ?? 0]);
    if (saldo < menorSaldo.valor) menorSaldo = { data, valor: saldo };
    if (saldo < 0 && !primeiroNegativo) primeiroNegativo = { data, valor: saldo };
  }
  return {
    dias,
    saldoHoje,
    entradas: somarValores(noPeriodo.filter((t) => t.tipo === "receita").map((t) => t.valorAberto)),
    saidas: somarValores(noPeriodo.filter((t) => t.tipo === "despesa").map((t) => t.valorAberto)),
    vencidoAPagarHoje,
    saldoFinal: { data: fim, valor: saldo },
    menorSaldo,
    primeiroNegativo,
  };
}

/** "AAAA-MM-DD" + n dias (calendário, sem fuso). */
function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Números do painel da Visão geral - realizado e projetado continuam
 * separados (cada cartão diz de qual base vem). */
export function montarVisaoGeral(params: {
  hoje: string;
  lancamentos: LancamentoBase[];
  baixas: BaixaBase[];
  contas: ContaFinanceira[];
  diasProximos?: number;
}): VisaoGeralFinanceira {
  const { hoje, lancamentos, baixas, contas, diasProximos = 15 } = params;
  const base = aberturasDasContas(contas);
  const [ano, mes] = hoje.split("-").map(Number);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const fimMes = `${hoje.slice(0, 7)}-${String(ultimoDiaDoMes(ano, mes - 1)).padStart(2, "0")}`;
  const limite = new Date(`${hoje}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + diasProximos);
  const limiteProximos = limite.toISOString().slice(0, 10);

  const baixadoPorParcela = new Map<string, number>();
  for (const b of baixas) {
    const delta = b.tipo === "estorno" ? -b.valor : b.valor;
    baixadoPorParcela.set(b.parcelaId, somarValores([baixadoPorParcela.get(b.parcelaId) ?? 0, delta]));
  }

  const abertos: TituloEmAberto[] = [];
  for (const l of lancamentos) {
    for (const p of l.parcelas) {
      if (p.status === "cancelado") continue;
      const valorAberto = somarValores([p.valor, -(baixadoPorParcela.get(p.id) ?? 0)]);
      if (valorAberto <= 0) continue;
      abertos.push({
        parcelaId: p.id,
        dataPrevista: p.dataPrevista,
        tipo: l.tipo,
        descricao: l.descricao,
        categoriaId: l.categoriaId,
        parcela: `${p.numero}/${p.totalParcelas}`,
        valorAberto,
      });
    }
  }

  const soma = (lista: TituloEmAberto[]) => somarValores(lista.map((t) => t.valorAberto));
  const noMes = abertos.filter((t) => t.dataPrevista >= inicioMes && t.dataPrevista <= fimMes);
  const vencidos = abertos.filter((t) => t.dataPrevista < hoje);

  const saldoRealizadoHoje = saldoAte(base, montarMovimentosCaixa({ visao: "realizado", lancamentos, baixas, contas }), hoje);
  return {
    saldoRealizadoHoje,
    saldoProjetadoFimDoMes: saldoAte(base, montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas, contas }), fimMes),
    aReceberNoMes: soma(noMes.filter((t) => t.tipo === "receita")),
    aPagarNoMes: soma(noMes.filter((t) => t.tipo === "despesa")),
    vencidoAReceber: soma(vencidos.filter((t) => t.tipo === "receita")),
    vencidoAPagar: soma(vencidos.filter((t) => t.tipo === "despesa")),
    proximosVencimentos: abertos
      .filter((t) => t.dataPrevista >= hoje && t.dataPrevista <= limiteProximos)
      .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista)),
    caixa30Dias: projetarCaixa({ hoje, saldoHoje: saldoRealizadoHoje, abertos }),
  };
}
