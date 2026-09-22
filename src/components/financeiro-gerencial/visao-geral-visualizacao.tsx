"use client";

import Link from "next/link";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CartaoIndicador, formatarNumero } from "@/components/financeiro-gerencial/tabela-anual";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { TituloEmAberto, VisaoGeralFinanceira } from "@/lib/financeiro-gerencial/visao-geral";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function VisaoGeralVisualizacao({
  hoje,
  visao,
  resultadoLiquidoMes,
  receitaMes,
  saldoProvisoes,
}: {
  hoje: string;
  visao: Omit<VisaoGeralFinanceira, "proximosVencimentos"> & { proximosVencimentos: (TituloEmAberto & { categoriaNome: string })[] };
  resultadoLiquidoMes: number | null;
  receitaMes: number;
  saldoProvisoes: number;
}) {
  const nomeMes = MESES[Number(hoje.slice(5, 7)) - 1];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Visão geral financeira</h1>
        <p className="text-sm text-cinza-medio">
          Hoje, {formatarDataBr(hoje)}. Caixa realizado e projetado aparecem separados, cada um na própria base.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoIndicador titulo="Saldo realizado hoje" valor={formatarNumero(visao.saldoRealizadoHoje)} detalhe="Saldo inicial + recebido - pago até hoje" />
        <CartaoIndicador titulo={`Saldo projetado fim de ${nomeMes}`} valor={formatarNumero(visao.saldoProjetadoFimDoMes)} detalhe="Todas as parcelas pela data prevista" />
        <CartaoIndicador titulo={`A receber em ${nomeMes}`} valor={formatarNumero(visao.aReceberNoMes)} detalhe="Em aberto no mês" />
        <CartaoIndicador titulo={`A pagar em ${nomeMes}`} valor={formatarNumero(visao.aPagarNoMes)} detalhe="Em aberto no mês" />
        <CartaoIndicador titulo="Vencido a receber" valor={formatarNumero(visao.vencidoAReceber)} detalhe="Data prevista antes de hoje" />
        <CartaoIndicador titulo="Vencido a pagar" valor={formatarNumero(visao.vencidoAPagar)} detalhe="Data prevista antes de hoje" />
        <CartaoIndicador
          titulo={`Resultado líquido de ${nomeMes}`}
          valor={resultadoLiquidoMes === null ? "Sem estoque do mês" : formatarNumero(resultadoLiquidoMes)}
          detalhe={`DRE por competência - receita ${formatarNumero(receitaMes)}`}
        />
        <CartaoIndicador titulo="Saldo de provisões" valor={formatarNumero(saldoProvisoes)} detalhe="Férias, 13º e multa do FGTS a pagar" />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/financeiro-gerencial/fluxo-caixa" className="rounded-md border border-cinza-claro px-3 py-1.5 font-semibold text-azul-petroleo hover:border-azul-petroleo">
          Fluxo de Caixa
        </Link>
        <Link href="/financeiro-gerencial/dre" className="rounded-md border border-cinza-claro px-3 py-1.5 font-semibold text-azul-petroleo hover:border-azul-petroleo">
          DRE
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
