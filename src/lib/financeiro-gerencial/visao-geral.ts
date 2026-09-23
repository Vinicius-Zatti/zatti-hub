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
};

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

  return {
    saldoRealizadoHoje: saldoAte(base, montarMovimentosCaixa({ visao: "realizado", lancamentos, baixas, contas }), hoje),
    saldoProjetadoFimDoMes: saldoAte(base, montarMovimentosCaixa({ visao: "projetado", lancamentos, baixas, contas }), fimMes),
    aReceberNoMes: soma(noMes.filter((t) => t.tipo === "receita")),
    aPagarNoMes: soma(noMes.filter((t) => t.tipo === "despesa")),
    vencidoAReceber: soma(vencidos.filter((t) => t.tipo === "receita")),
    vencidoAPagar: soma(vencidos.filter((t) => t.tipo === "despesa")),
    proximosVencimentos: abertos
      .filter((t) => t.dataPrevista >= hoje && t.dataPrevista <= limiteProximos)
      .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista)),
  };
}
