"use client";

import Link from "next/link";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CartaoIndicador, formatarNumero, formatarPercentual } from "@/components/financeiro-gerencial/tabela-anual";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { TituloEmAberto, VisaoGeralFinanceira } from "@/lib/financeiro-gerencial/visao-geral";
import type { MetaUnidade } from "@/lib/financeiro-gerencial/painel-mega";

export type ResumoDreMes = {
  faturamento: number;
  cmv: number;
  /** `null` = CMV do mês ainda provisório (sem estoque final ou sem Venda de Produtos). */
  cmvPercentual: number | null;
  resultado: number;
  meta: MetaUnidade | null;
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function VisaoGeralVisualizacao({
  hoje,
  visao,
  resumoDre,
  saldoProvisoes,
}: {
  hoje: string;
  visao: Omit<VisaoGeralFinanceira, "proximosVencimentos"> & { proximosVencimentos: (TituloEmAberto & { categoriaNome: string })[] };
  resumoDre: ResumoDreMes;
  saldoProvisoes: number;
}) {
  const nomeMes = MESES[Number(hoje.slice(5, 7)) - 1];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Painel financeiro</h1>
        <p className="text-sm text-cinza-medio">
          Hoje, {formatarDataBr(hoje)}. Caixa realizado e projetado aparecem separados, cada um na própria base.
        </p>
      </div>

      <AlertaCaixa caixa={visao.caixa30Dias} />

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">Caixa dos próximos {visao.caixa30Dias.dias} dias</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoIndicador
            titulo="Saldo hoje"
            valor={formatarNumero(visao.caixa30Dias.saldoHoje)}
            detalhe="Dinheiro nas contas agora"
            dica="Saldo inicial das contas + tudo que foi recebido - tudo que foi pago até hoje."
          />
          <CartaoIndicador
            titulo="Vai entrar"
            valor={formatarNumero(visao.caixa30Dias.entradas)}
            detalhe={`A receber até ${formatarDataBr(visao.caixa30Dias.saldoFinal.data)}`}
            dica="Soma do que está em aberto a receber com vencimento de hoje até o fim do período. A receber já vencido não entra."
          />
          <CartaoIndicador
            titulo="Vai sair"
            valor={formatarNumero(somar(visao.caixa30Dias.saidas, visao.caixa30Dias.vencidoAPagarHoje))}
            detalhe={visao.caixa30Dias.vencidoAPagarHoje > 0 ? `Inclui ${formatarNumero(visao.caixa30Dias.vencidoAPagarHoje)} já vencido` : "A pagar no período"}
            dica="Soma do que está em aberto a pagar com vencimento até o fim do período, mais o que já venceu e não foi pago (conta como pago hoje). Fatura de cartão entra no vencimento."
          />
          <CartaoIndicador
            titulo={`Saldo em ${formatarDataBr(visao.caixa30Dias.saldoFinal.data)}`}
            valor={formatarNumero(visao.caixa30Dias.saldoFinal.valor)}
            detalhe={`Menor saldo: ${formatarNumero(visao.caixa30Dias.menorSaldo.valor)} em ${formatarDataBr(visao.caixa30Dias.menorSaldo.data)}`}
            dica="Saldo hoje + vai entrar - vai sair. O menor saldo é o ponto mais baixo do caminho, dia a dia."
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">Resultado de {nomeMes} (DRE)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoIndicador
            titulo="Faturamento"
            valor={formatarNumero(resumoDre.faturamento)}
            detalhe={textoMeta(resumoDre.meta?.faturamento ?? null, resumoDre.faturamento, "piso", formatarNumero)}
            dica="Receita Operacional Bruta do mês, por competência."
          />
          <CartaoIndicador
            titulo={resumoDre.cmvPercentual === null ? "CMV (provisório)" : "% CMV"}
            valor={resumoDre.cmvPercentual === null ? formatarNumero(resumoDre.cmv) : formatarPercentual(resumoDre.cmvPercentual)}
            detalhe={
              resumoDre.cmvPercentual === null
                ? "Fecha com o estoque final e a Venda de Produtos do mês"
                : textoMeta(resumoDre.meta?.cmvPercentual ?? null, resumoDre.cmvPercentual, "teto", formatarPercentual)
            }
            dica="CMV = estoque inicial + compras - estoque final. % CMV = CMV ÷ Venda de Produtos."
          />
          <CartaoIndicador
            titulo="Resultado líquido"
            valor={formatarNumero(resumoDre.resultado)}
            detalhe={textoMeta(resumoDre.meta?.resultado ?? null, resumoDre.resultado, "piso", formatarNumero)}
            dica="Margem de contribuição - mão de obra - custos operacionais (linha Resultado Líquido do Exercício da DRE)."
          />
          <CartaoIndicador titulo="Saldo de provisões" valor={formatarNumero(saldoProvisoes)} detalhe="Férias, 13º e multa do FGTS a pagar" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">Contas de {nomeMes}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoIndicador titulo={`A receber em ${nomeMes}`} valor={formatarNumero(visao.aReceberNoMes)} detalhe="Em aberto no mês" />
          <CartaoIndicador titulo={`A pagar em ${nomeMes}`} valor={formatarNumero(visao.aPagarNoMes)} detalhe="Em aberto no mês" />
          <CartaoIndicador titulo="Vencido a receber" valor={formatarNumero(visao.vencidoAReceber)} detalhe="Data prevista antes de hoje" />
          <CartaoIndicador titulo="Vencido a pagar" valor={formatarNumero(visao.vencidoAPagar)} detalhe="Data prevista antes de hoje" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/financeiro-gerencial/fluxo-caixa" className="rounded-md border border-cinza-claro px-3 py-1.5 font-semibold text-azul-petroleo hover:border-azul-petroleo">
          Fluxo de Caixa
        </Link>
        <Link href="/financeiro-gerencial/dre" className="rounded-md border border-cinza-claro px-3 py-1.5 font-semibold text-azul-petroleo hover:border-azul-petroleo">
          DRE
        </Link>
        <Link href="/financeiro-gerencial/painel-mega" className="rounded-md border border-cinza-claro px-3 py-1.5 font-semibold text-azul-petroleo hover:border-azul-petroleo">
          Painel M.E.G.A.
        </Link>
        <Link href="/financeiro-gerencial/dfc" className="rounded-md border border-cinza-claro px-3 py-1.5 font-semibold text-azul-petroleo hover:border-azul-petroleo">
          DFC
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">Próximos vencimentos (15 dias)</h2>
        <TabelaRolavel ariaLabel="Próximos vencimentos">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="100px">Data</Th>
                <Th>Tipo</Th>
                <Th>Descrição</Th>
                <Th>Plano de Contas</Th>
                <Th align="right">Parcela</Th>
                <Th align="right">Em aberto</Th>
              </tr>
            </thead>
            <tbody>
              {visao.proximosVencimentos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-cinza-medio">
                    Nada vencendo nos próximos 15 dias.
                  </td>
                </tr>
              ) : (
                visao.proximosVencimentos.map((t) => (
                  <tr key={t.parcelaId} className="border-t border-cinza-claro">
                    <td className="whitespace-nowrap px-3 py-1.5">{formatarDataBr(t.dataPrevista)}</td>
                    <td className={`whitespace-nowrap px-3 py-1.5 font-semibold ${t.tipo === "receita" ? "text-verde" : "text-vermelho"}`}>
                      {t.tipo === "receita" ? "A receber" : "A pagar"}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-1.5" title={t.descricao}>
                      {t.descricao}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-1.5" title={t.categoriaNome}>
                      {t.categoriaNome}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">{t.parcela}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatarNumero(t.valorAberto)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TabelaRolavel>
      </div>
    </div>
  );
}

function somar(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100;
}

/** "Meta: X · dentro da meta" / "abaixo" (piso) ou "acima" (teto). Sem meta cadastrada, diz onde cadastrar. */
function textoMeta(meta: number | null, valor: number, sentido: "piso" | "teto", formatar: (v: number) => string): string {
  if (meta === null) return "Sem meta (cadastre no Painel M.E.G.A.)";
  const cumpre = sentido === "piso" ? valor >= meta : valor <= meta;
  return `Meta: ${formatar(meta)} · ${cumpre ? "dentro da meta" : sentido === "piso" ? "abaixo da meta" : "acima da meta"}`;
}

/** Alerta de necessidade de caixa: primeiro dia em que o saldo fica negativo nos próximos dias. */
function AlertaCaixa({ caixa }: { caixa: VisaoGeralFinanceira["caixa30Dias"] }) {
  if (caixa.primeiroNegativo) {
    return (
      <div role="alert" className="rounded-lg border border-vermelho bg-vermelho/10 p-4">
        <p className="font-display text-lg font-bold text-vermelho">Falta de caixa em {formatarDataBr(caixa.primeiroNegativo.data)}</p>
        <p className="text-sm text-cinza">
          Nesse dia o saldo fica em {formatarNumero(caixa.primeiroNegativo.valor)}. O ponto mais baixo é {formatarNumero(caixa.menorSaldo.valor)} em{" "}
          {formatarDataBr(caixa.menorSaldo.data)}: é quanto precisa entrar, ou deixar de sair, até lá para não faltar dinheiro.
        </p>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-lg border border-verde bg-verde/10 p-4 text-sm text-cinza">
      <span className="font-semibold text-verde">Caixa coberto nos próximos {caixa.dias} dias.</span> Com o que está a receber e a pagar, o saldo
      não fica negativo. O ponto mais baixo é {formatarNumero(caixa.menorSaldo.valor)} em {formatarDataBr(caixa.menorSaldo.data)}.
    </div>
  );
}
